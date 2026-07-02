# Contratos Compartilhados — @videoclipper/shared

O pacote `@videoclipper/shared` e o unico ponto de verdade para todos os tipos, enums e codigos de erro usados entre o backend (`@videoclipper/api`) e o frontend (`@videoclipper/web`). Nenhum tipo de contrato de API deve ser definido em outro lugar.

Para instalar e usar o pacote, consulte a secao [Como importar](#como-importar-e-buildar).
Para ver os endpoints que usam esses contratos, consulte [Referencia de API](./05-referencia-api.md).

---

## Estrutura do pacote

```
packages/shared/
├── src/
│   ├── index.ts                     # Barrel file — exporta tudo
│   ├── enums/
│   │   ├── job-status.enum.ts       # JobStatus + tipo
│   │   └── pipeline-phase.enum.ts   # PipelinePhase + PHASE_WEIGHTS
│   ├── contracts/
│   │   ├── job.contract.ts          # CreateJobRequest/Response, JobResult, VideoMetadata
│   │   ├── clip.contract.ts         # ClipResult, SuggestedClip
│   │   ├── progress.contract.ts     # ProgressEvent, ProgressStatus
│   │   ├── whisper.contract.ts      # WhisperResponse, WhisperSegment, WhisperWord
│   │   └── gemini.contract.ts       # GeminiAnalysisRequest, GeminiAnalysisResponse
│   └── errors/
│       └── error-codes.ts           # ErrorCode
└── tsconfig.json
```

---

## Enums

### JobStatus

Status possiveis de um job de processamento.

```typescript
// packages/shared/src/enums/job-status.enum.ts
export const JobStatus = {
  QUEUED:     'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED:  'COMPLETED',
  FAILED:     'FAILED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
```

| Valor | Quando ocorre |
|---|---|
| `QUEUED` | Retornado imediatamente no `POST /api/jobs` antes do pipeline iniciar |
| `PROCESSING` | Pipeline em execucao |
| `COMPLETED` | Todas as 4 fases concluidas com sucesso |
| `FAILED` | Qualquer fase lancou excecao nao tratada |

### PipelinePhase

Identifica cada fase do pipeline. Tambem usado nos eventos SSE de progresso.

```typescript
// packages/shared/src/enums/pipeline-phase.enum.ts
export const PipelinePhase = {
  INGESTION:        'INGESTION',
  TRANSCRIPTION:    'TRANSCRIPTION',
  VIRALITY_ANALYSIS: 'VIRALITY_ANALYSIS',
  EDITING_EXPORT:   'EDITING_EXPORT',
  CLEANUP:          'CLEANUP',
} as const;

export type PipelinePhase = (typeof PipelinePhase)[keyof typeof PipelinePhase];
```

### PHASE_WEIGHTS

Pesos percentuais de cada fase no calculo do progresso global. A soma dos pesos das 4 fases principais e 100. O `CLEANUP` tem peso 0 pois nao contribui para o progresso visivel.

```typescript
export const PHASE_WEIGHTS: Record<PipelinePhase, number> = {
  [PipelinePhase.INGESTION]:         15,
  [PipelinePhase.TRANSCRIPTION]:     20,
  [PipelinePhase.VIRALITY_ANALYSIS]: 15,
  [PipelinePhase.EDITING_EXPORT]:    50,
  [PipelinePhase.CLEANUP]:            0,
};
```

| Fase | Peso | Acumulado |
|---|---|---|
| INGESTION | 15% | 15% |
| TRANSCRIPTION | 20% | 35% |
| VIRALITY_ANALYSIS | 15% | 50% |
| EDITING_EXPORT | 50% | 100% |
| CLEANUP | 0% | — |

---

## ErrorCode

Codigos de erro estruturados usados pela hierarquia `AppError` no backend e expostos nas respostas de erro da API.

```typescript
// packages/shared/src/errors/error-codes.ts
export const ErrorCode = {
  VIDEO_DOWNLOAD_FAILED:    'VIDEO_DOWNLOAD_FAILED',
  VIDEO_INVALID_URL:        'VIDEO_INVALID_URL',
  VIDEO_TOO_LONG:           'VIDEO_TOO_LONG',
  TRANSCRIPTION_FAILED:     'TRANSCRIPTION_FAILED',
  TRANSCRIPTION_TIMEOUT:    'TRANSCRIPTION_TIMEOUT',
  GEMINI_ANALYSIS_FAILED:   'GEMINI_ANALYSIS_FAILED',
  GEMINI_RATE_LIMITED:      'GEMINI_RATE_LIMITED',
  FFMPEG_PROCESSING_FAILED: 'FFMPEG_PROCESSING_FAILED',
  FFMPEG_INVALID_TIMESTAMPS: 'FFMPEG_INVALID_TIMESTAMPS',
  CLEANUP_FAILED:           'CLEANUP_FAILED',
  JOB_NOT_FOUND:            'JOB_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

Para o mapeamento de cada `ErrorCode` para sua classe de erro e HTTP status, consulte [Tratamento de Erros](./08-tratamento-de-erros.md).

---

## Contratos de Job

### CreateJobRequest

Enviado pelo cliente no `POST /api/jobs`.

```typescript
// packages/shared/src/contracts/job.contract.ts
export interface CreateJobRequest {
  readonly videoUrl: string;   // URL completa do YouTube
}
```

### CreateJobResponse

Retornado pelo `POST /api/jobs` com status 201.

```typescript
export interface CreateJobResponse {
  readonly jobId: string;      // UUID v4
  readonly status: JobStatus;  // Sempre 'QUEUED' na criacao
  readonly createdAt: string;  // ISO 8601
}
```

### JobResult

Retornado pelo `GET /api/jobs/:id`. Representa o estado completo do job.

```typescript
export interface JobResult {
  readonly jobId: string;
  readonly status: JobStatus;
  readonly videoMetadata: VideoMetadata | null;     // null ate fase 1 concluir
  readonly clips: ReadonlyArray<ClipResult>;        // vazio ate fase 4 concluir
  readonly createdAt: string;     // ISO 8601
  readonly completedAt: string | null;
  readonly error: string | null;  // mensagem de erro se status === FAILED
}
```

### VideoMetadata

Metadados extraidos pelo yt-dlp na fase de Ingestion.

```typescript
export interface VideoMetadata {
  readonly title: string;
  readonly channel: string;
  readonly durationSeconds: number;
  readonly thumbnailUrl: string;
}
```

---

## Contratos de Clip

### ClipResult

Representa um corte processado e disponivel para download. E o objeto retornado no array `clips` do `JobResult`.

```typescript
// packages/shared/src/contracts/clip.contract.ts
export interface ClipResult {
  readonly clipId: string;            // UUID v4 unico por corte
  readonly index: number;             // Indice 0-based na lista de cortes
  readonly startSeconds: number;      // Inicio do corte no video original
  readonly endSeconds: number;        // Fim do corte no video original
  readonly durationSeconds: number;   // Duracao calculada
  readonly seoTitle: string;          // Titulo otimizado para SEO (max 100 chars)
  readonly description: string;       // Legenda para redes sociais (max 300 chars)
  readonly hashtags: ReadonlyArray<string>;
  readonly whyChosen: string;         // Justificativa tecnica do Gemini
  readonly thumbnailUrl: string;      // URL relativa: /api/jobs/:jobId/clips/:i/download/thumbnail
  readonly videoUrl: string;          // URL relativa: /api/jobs/:jobId/clips/:i/download/video
  readonly copyUrl: string;           // URL relativa: /api/jobs/:jobId/clips/:i/download/copy
  readonly srtUrl: string;            // URL relativa: /api/jobs/:jobId/clips/:i/download/srt
}
```

### SuggestedClip

Representa um corte sugerido pelo Gemini, antes do processamento FFmpeg. Usado internamente no pipeline (nao exposto diretamente na API publica).

```typescript
export interface SuggestedClip {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly seoTitle: string;
  readonly description: string;
  readonly hashtags: ReadonlyArray<string>;
  readonly whyChosen: string;
  readonly hookText: string;          // Texto exato do gancho inicial
  readonly keywords: ReadonlyArray<string>;
}
```

---

## Contrato de Progresso

### ProgressStatus

```typescript
// packages/shared/src/contracts/progress.contract.ts
export type ProgressStatus = 'started' | 'progress' | 'completed' | 'failed';
```

| Valor | Significado |
|---|---|
| `started` | A fase acabou de comecar |
| `progress` | Atualizacao incremental de progresso |
| `completed` | A fase foi concluida com sucesso |
| `failed` | A fase ou o pipeline falhou |

### ProgressEvent

Evento emitido via SSE a cada atualizacao de progresso. E o tipo recebido pelo frontend no hook `useSSE`.

```typescript
export interface ProgressEvent {
  readonly jobId: string;
  readonly phase: PipelinePhase;
  readonly status: ProgressStatus;
  readonly percentage: number;       // Progresso da fase atual (0-100, inteiro)
  readonly overallPercentage: number; // Progresso global ponderado (0-100, inteiro)
  readonly message: string;          // Mensagem legivel para o usuario
  readonly timestamp: string;        // ISO 8601
}
```

---

## Contratos Whisper

Modelam a resposta do servidor whisper.cpp no formato `verbose_json`.

```typescript
// packages/shared/src/contracts/whisper.contract.ts
export interface WhisperResponse {
  readonly text: string;                            // Transcricao completa
  readonly segments: ReadonlyArray<WhisperSegment>;
  readonly language: string;                        // Codigo do idioma detectado (ex: 'pt')
}

export interface WhisperSegment {
  readonly id: number;
  readonly start: number;   // Inicio do segmento em segundos
  readonly end: number;     // Fim do segmento em segundos
  readonly text: string;    // Texto do segmento
  readonly words: ReadonlyArray<WhisperWord>;
}

export interface WhisperWord {
  readonly word: string;
  readonly start: number;       // Inicio da palavra em segundos
  readonly end: number;         // Fim da palavra em segundos
  readonly probability: number; // Confianca (0.0 - 1.0)
}
```

---

## Contratos Gemini

Modelam a requisicao e resposta do servico de analise de viralidade.

```typescript
// packages/shared/src/contracts/gemini.contract.ts
export interface GeminiAnalysisRequest {
  readonly videoTitle: string;
  readonly channelName: string;
  readonly transcription: WhisperResponse;
  readonly videoDurationSeconds: number;
}

export interface GeminiAnalysisResponse {
  readonly suggestedClips: ReadonlyArray<SuggestedClip>;
  readonly overallAnalysis: string;   // Analise geral do potencial viral
}
```

---

## Convencoes readonly e ReadonlyArray

Todas as interfaces de contrato seguem estas convencoes:

1. **Todos os campos sao `readonly`**: impede mutacao acidental em qualquer camada
2. **Arrays usam `ReadonlyArray<T>`**: nao e possivel chamar `.push()`, `.pop()`, `.sort()` diretamente
3. **Enums sao `const`**: o pattern `as const` + tipo derivado evita enum reverso e garante tree-shaking

Para trabalhar com arrays readonly em codigo que precisa de mutacao, use spread:
```typescript
// Correto
const clips = [...result.clips];

// Incorreto — erro de tipo
result.clips.push(newClip);
```

---

## Como importar e buildar

### Importar no backend ou frontend

```typescript
// Importar tipos e enums
import type { JobResult, ClipResult, ProgressEvent } from '@videoclipper/shared';
import { JobStatus, PipelinePhase, PHASE_WEIGHTS, ErrorCode } from '@videoclipper/shared';
```

O frontend tambem re-exporta tudo via `apps/web/src/types/index.ts` com alias `@/types`:

```typescript
import type { ClipResult } from '@/types';
import { JobStatus } from '@/types';
```

### Buildar o pacote shared

O shared precisa ser compilado antes de qualquer pacote que o consume. O Turborepo gerencia isso automaticamente via dependencias de pipeline, mas voce pode buildar isoladamente:

```bash
pnpm turbo build --filter=@videoclipper/shared
```

Apos alterar contratos no shared, sempre execute o build antes de testar os outros pacotes. O output compilado vai para `packages/shared/dist/`.

### Verificacao de tipos

```bash
pnpm turbo typecheck
```

O typecheck e executado em todos os pacotes, garantindo que alteracoes em contratos do shared que quebrem consumidores sejam detectadas imediatamente.
