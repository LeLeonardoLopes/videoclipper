# Arquitetura — VideoClipper v2

Este documento descreve a arquitetura do monorepo, o fluxo de dados entre as camadas e as decisoes tecnicas relevantes do sistema.

Para detalhes de instalacao, consulte [Instalacao e Configuracao](./02-instalacao-e-configuracao.md).
Para o pipeline de processamento, consulte [Pipeline de Processamento](./04-pipeline-de-processamento.md).

---

## Diagrama do monorepo

```
VideoClipper_v2/                     (raiz — Turborepo + pnpm workspaces)
│
├── apps/
│   ├── api/                         @videoclipper/api
│   │   └── src/
│   │       ├── config/              Validacao de env (Zod) + constantes
│   │       ├── errors/              AppError + subclasses especificas
│   │       ├── pipeline/
│   │       │   ├── pipeline-orchestrator.ts   Orquestra as 4 fases
│   │       │   ├── progress-emitter.ts        EventEmitter + buffer replay
│   │       │   └── phases/
│   │       │       ├── phase.interface.ts     Contrato generico de fase
│   │       │       ├── ingestion.phase.ts     Download via yt-dlp
│   │       │       ├── transcription.phase.ts Whisper + extracao de audio
│   │       │       ├── virality-analysis.phase.ts  Gemini API
│   │       │       └── editing-export.phase.ts     FFmpeg + SRT + copy
│   │       ├── routes/
│   │       │   ├── health.routes.ts           GET /api/health
│   │       │   ├── jobs.routes.ts             POST/GET /api/jobs + SSE
│   │       │   └── clips.routes.ts            GET download de arquivos
│   │       ├── services/
│   │       │   ├── video-downloader.service.ts   yt-dlp wrapper
│   │       │   ├── whisper.service.ts             HTTP client whisper.cpp
│   │       │   ├── whisper-process.service.ts     Spawn/monitor do processo
│   │       │   ├── gemini.service.ts              Google Generative AI SDK
│   │       │   ├── ffmpeg.service.ts              Spawn FFmpeg por corte
│   │       │   ├── srt-generator.service.ts       Gera .srt a partir de WhisperResponse
│   │       │   ├── copy-generator.service.ts      Gera copy.txt por corte
│   │       │   └── cleanup.service.ts             rm -rf do tempDir
│   │       ├── types/               Declaracoes de modulo (FastifyInstance)
│   │       └── utils/               logger (pino), retry, temp-dir
│   │
│   └── web/                         @videoclipper/web
│       └── src/
│           ├── pages/               3 paginas (Home, Processing, Results)
│           ├── components/          16 componentes por dominio
│           ├── stores/              Zustand (pipeline + history)
│           ├── hooks/               useSSE, usePipelineProgress
│           ├── services/            apiClient, createSSEConnection
│           └── types/               Re-exportacoes de @videoclipper/shared
│
└── packages/
    ├── shared/                      @videoclipper/shared
    │   └── src/
    │       ├── enums/               JobStatus, PipelinePhase, PHASE_WEIGHTS
    │       ├── contracts/           Interfaces TypeScript de todos os contratos
    │       └── errors/              ErrorCode
    ├── tsconfig/                    @videoclipper/tsconfig
    │   ├── base.json                Base TypeScript strict
    │   ├── node.json                Extends base + config Node.js
    │   └── react.json               Extends base + config React/Vite
    └── eslint-config/               @videoclipper/eslint-config
```

---

## Fluxo de dados — visao end-to-end

```
Browser                    Fastify API                   Servicos externos
  │                              │
  │  POST /api/jobs              │
  │  { videoUrl }                │
  ├─────────────────────────────>│
  │                              ├── orchestrator.startJob()
  │  { jobId, status: QUEUED }   │   └── runPipeline() [async, nao bloqueia]
  │<─────────────────────────────┤
  │                              │
  │  GET /api/jobs/:id/progress  │
  ├─────────────────────────────>│  [SSE aberto]
  │                              │
  │                              │  IngestionPhase
  │                              │  └── VideoDownloaderService
  │<── data: {phase:INGESTION}   │      └── spawn yt-dlp ──────────────────> YouTube
  │    ...progresso...           │          stdout: XX%
  │                              │  → video.mp4 salvo em TEMP_DIR/<jobId>/
  │                              │
  │                              │  TranscriptionPhase
  │                              │  └── FFmpeg extrai audio.wav
  │                              │  └── WhisperService
  │<── data: {phase:TRANSCRIPTION│      └── POST multipart ─────────────────> whisper.cpp:9000
  │                              │          resposta: WhisperResponse (JSON)
  │                              │
  │                              │  ViralityAnalysisPhase
  │                              │  └── GeminiService
  │<── data: {phase:VIRALITY...} │      └── generateContent() ─────────────> Gemini API
  │                              │          resposta: { suggestedClips[] }
  │                              │
  │                              │  EditingExportPhase
  │                              │  └── SrtGeneratorService → clip_N.srt
  │                              │  └── FFmpegService
  │<── data: {phase:EDITING...}  │      └── spawn ffmpeg (N cortes, concurrencia 2)
  │                              │          → clip_N.mp4 + clip_N_thumb.jpg
  │                              │  └── CopyGeneratorService → clip_N_copy.txt
  │                              │
  │<── data: {status:completed}  │  [SSE encerrado automaticamente]
  │                              │  CleanupService.deleteRawVideo(tempDir)
  │                              │  ← rm -rf TEMP_DIR/<jobId>/
  │                              │
  │  GET /api/jobs/:id           │
  ├─────────────────────────────>│
  │  { status: COMPLETED,        │
  │    clips: [...] }            │
  │<─────────────────────────────┤
  │                              │
  │  GET /api/jobs/:id/clips/0   │
  │       /download/video        │
  ├─────────────────────────────>│
  │  [stream do clip_0.mp4]      │
  │<─────────────────────────────┤
```

---

## Comunicacao em tempo real — SSE e ProgressEmitter

A escolha por **Server-Sent Events** em vez de WebSockets foi deliberada: o fluxo de progresso e unidirecional (servidor → cliente), SSE e mais simples de implementar, nao requer upgrade de protocolo e funciona nativamente com `EventSource` no browser.

### Mecanismo de replay

O `ProgressEmitter` mantem um array `buffer: ProgressEvent[]` que acumula todos os eventos emitidos desde a criacao. Quando um cliente conecta via SSE, o servidor:

1. Registra o listener `onProgress` no emitter
2. Chama `emitter.replayTo(onProgress)` para enviar todos os eventos ja bufferizados

Isso garante que clientes lentos ou que recarregam a pagina recebam o historico completo sem gap.

### Registro e ciclo de vida dos emitters

```
POST /api/jobs
  └── cria ProgressEmitter
  └── server.jobEmitters.set(jobId, emitter)

GET /api/jobs/:id/progress
  └── server.jobEmitters.get(jobId)
  └── emitter.on('progress', onProgress)
  └── emitter.replayTo(onProgress)
  └── [ao fechar] emitter.removeListener + jobEmitters.delete

Pipeline concluido/falhou
  └── SSE encerra → cleanup remove da map
```

---

## Armazenamento em memoria

O estado dos jobs e mantido num `Map<string, JobState>` no processo Node do Fastify. Esta e uma decisao consciente para a versao atual, explicitamente marcada no codigo como candidata a upgrade para banco de dados.

**Implicacoes:**
- Reinicializacao do servidor perde todos os jobs
- Nao suporta escalonamento horizontal (multiplas instancias)
- Adequado para uso single-instance em desenvolvimento e producao inicial

**Caminho de upgrade**: substituir o `Map` por um repositorio com interface compativel (Redis, Postgres, SQLite).

---

## Decisoes tecnicas relevantes

### TypeScript strict em todo o monorepo

Todos os pacotes usam `"strict": true` herdado de `@videoclipper/tsconfig`. O compilador rejeita `any` implícito, `null` nao tratado e chamadas sem tipo. Isso elimina classes inteiras de bugs em runtime.

### Spawn de processos externos

FFmpeg, yt-dlp e whisper-server sao invocados via `child_process.spawn` (nao `exec`). O `spawn` e preferido porque:
- Suporta streaming de stdout/stderr sem acumular em memoria
- Permite capturar progresso linha a linha
- Nao tem limite de buffer como o `exec`

Em Windows, os processos sao iniciados com `{ shell: true }` para compatibilidade.

### Cleanup obrigatorio no `finally`

A delecao do .mp4 bruto e do diretorio temporario ocorre no bloco `finally` do `runPipeline`. Isso garante que o arquivo seja deletado mesmo que qualquer fase falhe com excecao. O `CleanupService.deleteRawVideo` nunca propaga excecoes — loga e continua — para que o status do job nao seja sobrescrito por um erro secundario de cleanup.

### Concorrencia FFmpeg

O processamento de cortes respeita `FFMPEG_CONCURRENCY` (padrao: 2). O FFmpeg e intensivo em CPU; rodar muitos em paralelo degrada performance. O valor configuravel permite ajuste por hardware.

### Fallback de modelo Gemini

O `GeminiService` tenta o modelo primario (`gemini-2.5-flash`) e, em caso de erro 503/429/overloaded, tenta o fallback (`gemini-2.0-flash`). Isso aumenta a resiliencia sem adicionar complexidade ao chamador.

### Retry com backoff exponencial

O `withRetry` aplica backoff exponencial: `delay = min(baseDelayMs * 2^(attempt-1), maxDelayMs)`. Os valores padrao resultam na sequencia 1s, 2s, 4s (3 tentativas). O `shouldRetry` permite excluir erros nao retentaveis (ex: `TranscriptionError` — resposta invalida do Whisper nao melhora com retry).

### Tipos compartilhados via workspace package

O `@videoclipper/shared` e construido como pacote TypeScript com declaracoes `.d.ts` em `dist/`. Ambos api e web dependem dele via `workspace:*`. O Turborepo garante que o shared seja buildado antes dos consumidores no grafo de dependencias.

### SRT com timestamps no nivel de palavra

O `SrtGeneratorService` usa os timestamps de palavra (`WhisperWord`) para agrupar legendas em blocos de 7 palavras, criando subtitulos sincronizados com precisao. O fallback para timestamps de segmento e ativado quando a resposta do Whisper nao inclui dados de palavras.
