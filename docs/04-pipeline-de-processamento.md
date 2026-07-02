# Pipeline de Processamento — VideoClipper v2

O pipeline e o nucleo do VideoClipper. Ele orquestra 4 fases sequenciais de processamento, emite progresso em tempo real via SSE e garante a delecao obrigatoria do .mp4 bruto ao final — independentemente de sucesso ou falha.

Para entender como o progresso e consumido no frontend, consulte [Guia Frontend](./06-guia-frontend.md).
Para a referencia dos tipos usados aqui, consulte [Contratos Compartilhados](./07-contratos-compartilhados.md).

---

## Interface PipelinePhaseHandler

Cada uma das 4 fases implementa esta interface generica:

```typescript
// apps/api/src/pipeline/phases/phase.interface.ts
export interface PipelinePhaseHandler<TInput, TOutput> {
  readonly name: PipelinePhase;
  execute(input: TInput, emitter: ProgressEmitter): Promise<TOutput>;
}
```

O contrato e simples e uniforme: toda fase recebe um input tipado, um emitter para reportar progresso, e retorna uma Promise com output tipado. O orquestrador nao conhece os detalhes internos de cada fase — apenas chama `execute`.

---

## PipelineOrchestrator

O `PipelineOrchestrator` e a classe central. Ela mantem o armazenamento de jobs em memoria (`Map<string, JobState>`), inicia o pipeline de forma assincrona e expoe o resultado via `getJob`.

### Fluxo de execucao

```
startJob(videoUrl, emitter)
  │
  ├── Gera UUID (jobId)
  ├── Registra JobState com status PROCESSING
  ├── Chama runPipeline() de forma assincrona (sem await)
  └── Retorna jobId imediatamente para o caller
       │
       └── runPipeline()
             ├── Fase 1: IngestionPhase.execute()   → { videoPath, metadata }
             ├── Fase 2: TranscriptionPhase.execute() → { whisperResponse }
             ├── Fase 3: ViralityAnalysisPhase.execute() → { analysis }
             ├── Fase 4: EditingExportPhase.execute() → { clipResults }
             ├── [sucesso] status = COMPLETED
             ├── [erro]    status = FAILED, error = message
             └── [finally] CleanupService.deleteRawVideo(tempDir)  ← SEMPRE
```

### Armazenamento em memoria

O estado de cada job e mantido num `Map<string, JobState>` no processo Node. Isso e intencional para a versao atual — o comentario no codigo indica upgrade para banco de dados como trabalho futuro. Uma reinicializacao do servidor perde o estado de todos os jobs.

```typescript
interface JobState {
  readonly jobId: string;
  status: string;             // JobStatus
  videoMetadata: VideoMetadata | null;
  clips: ClipResult[];
  createdAt: string;          // ISO 8601
  completedAt: string | null; // ISO 8601
  error: string | null;
}
```

---

## ProgressEmitter

O `ProgressEmitter` e um `EventEmitter` especializado que:

1. Calcula o progresso global ponderado com base nos pesos de cada fase
2. Garante que o progresso global nunca regride (exceto em `failed`)
3. Mantem um **buffer de replay** de todos os eventos emitidos

### Pesos das fases

```typescript
// packages/shared/src/enums/pipeline-phase.enum.ts
export const PHASE_WEIGHTS: Record<PipelinePhase, number> = {
  INGESTION:        15,   // 15%
  TRANSCRIPTION:    20,   // 20%
  VIRALITY_ANALYSIS: 15,  // 15%
  EDITING_EXPORT:   50,   // 50%
  CLEANUP:           0,   // 0% — nao contribui para o progresso total
};
```

O total dos pesos e 100. O progresso global e calculado somando os pesos das fases completas mais a contribuicao parcial da fase atual:

```
overallPercentage = sum(weight[fase_completa]) + (weight[fase_atual] * percentual_atual / 100)
```

### Buffer de replay

Quando um cliente SSE conecta apos o inicio do pipeline, ele recebe todos os eventos ja emitidos via `replayTo(listener)`. Isso evita que clientes que demoram para conectar percam o historico de progresso.

```typescript
replayTo(listener: (event: ProgressEvent) => void): void {
  for (const event of this.buffer) {
    listener(event);
  }
}
```

O buffer nunca e limpo durante a vida do emitter. Cada evento emitido via `emitProgress` e adicionado ao buffer e emitido ao mesmo tempo para todos os listeners ativos.

### Assinatura de emitProgress

```typescript
emitProgress(
  phase: PipelinePhase,
  status: ProgressStatus,   // 'started' | 'progress' | 'completed' | 'failed'
  percentage: number,       // percentual da fase atual (0-100)
  message: string,          // mensagem legivel para o usuario
): void
```

---

## Fase 1: Ingestion (peso 15%)

**Classe**: `IngestionPhase`
**Input**: `{ videoUrl: string; tempDir: string }`
**Output**: `{ videoPath: string; metadata: VideoMetadata }`

### Responsabilidades

1. Valida a URL do YouTube via regex
2. Chama `VideoDownloaderService.download()` que:
   - Busca metadados via `yt-dlp --dump-json --no-download` (titulo, canal, duracao, thumbnail)
   - Baixa o video completo com `yt-dlp -f bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`
   - Emite progresso parsando as linhas `\d+\.?\d*%` do stdout do yt-dlp

### Mensagens de progresso

| Status | Mensagem |
|---|---|
| `started` | `Iniciando download do video...` |
| `progress` | `Baixando video... XX%` |
| `completed` | `Download concluido!` |

### Erros possiveis

| Classe | Codigo | HTTP |
|---|---|---|
| `VideoInvalidUrlError` | `VIDEO_INVALID_URL` | 400 |
| `VideoDownloadError` | `VIDEO_DOWNLOAD_FAILED` | 502 |

---

## Fase 2: Transcription (peso 20%)

**Classe**: `TranscriptionPhase`
**Input**: `{ videoPath: string }`
**Output**: `{ whisperResponse: WhisperResponse }`

### Responsabilidades

1. Extrai o audio do video para `audio.wav` (PCM 16-bit, 16 kHz, mono) via FFmpeg
2. Envia o WAV ao servidor whisper.cpp via multipart POST em `/inference`
3. Recebe a transcricao com timestamps no nivel de palavra

### Extracao de audio (FFmpeg)

```
ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 -y audio.wav
```

O arquivo `audio.wav` e salvo no mesmo diretorio temporario do video.

### Comunicacao com whisper.cpp

```
POST http://localhost:9000/inference
Content-Type: multipart/form-data

file       = <blob do audio.wav>
language   = pt
response_format = verbose_json
word_timestamps = true
```

Timeout: 300 segundos. Retry: 3 tentativas com backoff exponencial (2s, 4s, 8s). O retry so e ativado para erros de conexao — respostas HTTP de erro nao sao retentadas.

### Mensagens de progresso

| Status | Mensagem |
|---|---|
| `started` | `Extraindo audio do video...` |
| `progress` (20%) | `Audio extraido. Iniciando transcricao...` |
| `progress` (30%) | `Transcrevendo o conteudo do video...` |
| `completed` | `Transcricao concluida! N segmentos identificados.` |

### Erros possiveis

| Classe | Codigo | HTTP |
|---|---|---|
| `TranscriptionError` | `TRANSCRIPTION_FAILED` | 502 |
| `TranscriptionTimeoutError` | `TRANSCRIPTION_TIMEOUT` | 504 |

---

## Fase 3: Virality Analysis (peso 15%)

**Classe**: `ViralityAnalysisPhase`
**Input**: `{ metadata: VideoMetadata; whisperResponse: WhisperResponse }`
**Output**: `{ analysis: GeminiAnalysisResponse }`

### Responsabilidades

1. Monta o prompt estruturado com titulo, canal, duracao e transcricao com timestamps
2. Envia ao Gemini 2.5 Flash em modo JSON (`responseMimeType: 'application/json'`)
3. Valida e filtra os clipes sugeridos (duracao entre 15s e 90s, timestamps validos)
4. Se o modelo primario retornar 503/429, tenta o modelo de fallback (`gemini-2.0-flash`)

### Estrutura do prompt

O prompt instrui o Gemini a identificar de 3 a 8 cortes virais (30-90 segundos cada) com:
- Gancho forte nos primeiros 3 segundos
- Desenvolvimento com valor ou entretenimento
- Conclusao satisfatoria ou cliffhanger

A resposta e um JSON estruturado com `suggestedClips[]` e `overallAnalysis`.

### Progresso simulado

Como a chamada ao Gemini nao fornece progresso incremental, a fase simula avanco a cada 2 segundos em incrementos de 5%, limitando a 85% ate a resposta chegar.

### Fallback de modelo

```
modelo primario (gemini-2.5-flash)
  └── erro 503/429/overloaded → tenta gemini-2.0-flash
        └── erro → GeminiAnalysisError
```

### Erros possiveis

| Classe | Codigo | HTTP |
|---|---|---|
| `GeminiAnalysisError` | `GEMINI_ANALYSIS_FAILED` | 502 |

---

## Fase 4: Editing & Export (peso 50%)

**Classe**: `EditingExportPhase`
**Input**: `{ videoPath, whisperResponse, suggestedClips, outputDir, jobId }`
**Output**: `{ clipResults: ClipResult[] }`

### Responsabilidades

1. Cria o diretorio de saida `output/<jobId>/` e subdiretorio `srt/`
2. Gera um arquivo `.srt` por corte (word-level ou segment-level como fallback)
3. Processa os cortes com FFmpeg em lotes de `FFMPEG_CONCURRENCY` (padrao: 2)
4. Gera thumbnail `.jpg` para cada corte (frame no segundo 1)
5. Gera arquivo `copy.txt` com titulo, caption, hashtags e analise por corte

### Geracao de SRT

O `SrtGeneratorService` agrupa as palavras em blocos de 7 (`WORDS_PER_GROUP = 7`), ajustando os timestamps relativamente ao inicio do corte. Se nao houver timestamps no nivel de palavra, usa os timestamps de segmento como fallback.

### Processamento FFmpeg

Cada corte passa pelo seguinte pipeline FFmpeg:

```
Input: video.mp4 (segmento -ss start -t duration)
Filtros de video:
  1. crop=ih*9/16:ih:(iw-ih*9/16)/2:0   (crop central para 9:16)
  2. subtitles='clip_N.srt'               (queima de legendas)
Filtro de audio:
  loudnorm=I=-16:TP=-1.5:LRA=11          (normalizacao EBU R128)
Codec de video: libx264, preset fast, CRF 23
Codec de audio: AAC 128k
Flags: -movflags +faststart (streaming)
```

O progresso por corte e calculado a partir das linhas `out_time_ms=` do stdout do FFmpeg. O progresso geral da fase e a media dos progressos de todos os cortes, nunca regredindo.

### Estrutura de saida

```
output/
└── <jobId>/
    ├── clip_0.mp4
    ├── clip_0_copy.txt
    ├── clip_0_thumb.jpg
    ├── clip_1.mp4
    ├── clip_1_copy.txt
    ├── clip_1_thumb.jpg
    └── srt/
        ├── clip_0.srt
        └── clip_1.srt
```

### Mensagens de progresso

| Status | Mensagem |
|---|---|
| `started` | `Iniciando edicao dos cortes...` |
| `progress` (10%) | `Legendas geradas. Editando os cortes...` |
| `progress` (10-90%) | `Editando cortes... N/TOTAL prontos` |
| `completed` | `N cortes exportados com sucesso!` |

---

## Cleanup (obrigatorio — peso 0%)

**Classe**: `CleanupService`

O cleanup e executado no bloco `finally` do `runPipeline`, garantindo execucao **sempre**, independentemente de sucesso ou falha em qualquer fase.

```typescript
// Nunca lanca excecao — loga o erro e continua
async deleteRawVideo(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    logger.error({ error, tempDir }, 'Cleanup failed — manual intervention may be needed');
  }
}
```

O diretorio temporario completo (incluindo `video.mp4` e `audio.wav`) e deletado com `recursive: true` e `force: true`. Se o cleanup falhar, o erro e logado mas **nao propaga** — o job mantem seu status (COMPLETED ou FAILED) inalterado.

---

## Diagrama sequencial completo

```
HTTP POST /api/jobs
      |
      v
PipelineOrchestrator.startJob()
      |
      ├── cria jobId, JobState (PROCESSING)
      ├── registra ProgressEmitter no server.jobEmitters
      └── runPipeline() [assincrono]
              |
              ├── createJobTempDir()   → /tmp/videoclipper/<jobId>/
              |
              ├── [15%] IngestionPhase.execute()
              |         VideoDownloaderService → yt-dlp
              |         → { videoPath, metadata }
              |
              ├── [20%] TranscriptionPhase.execute()
              |         FFmpeg extrai audio.wav
              |         WhisperService → POST whisper.cpp:9000/inference
              |         → { whisperResponse }
              |
              ├── [15%] ViralityAnalysisPhase.execute()
              |         GeminiService → Gemini 2.5 Flash API
              |         → { analysis: { suggestedClips[], overallAnalysis } }
              |
              ├── [50%] EditingExportPhase.execute()
              |         SrtGeneratorService → clip_N.srt
              |         FFmpegService → clip_N.mp4 + clip_N_thumb.jpg
              |         CopyGeneratorService → clip_N_copy.txt
              |         → { clipResults[] }
              |
              ├── status = COMPLETED
              |
              └── [finally] CleanupService.deleteRawVideo(tempDir)
                            ← deleta video.mp4 + audio.wav + dir temp
```
