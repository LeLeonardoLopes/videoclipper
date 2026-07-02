# Visao Geral — VideoClipper v2

## O que e o VideoClipper

VideoClipper v2 e um SaaS para geração automatizada de cortes virais de vídeos do YouTube, destinados a redes sociais como TikTok, Instagram Reels e YouTube Shorts. O usuário fornece uma URL de vídeo do YouTube e o sistema entrega cortes prontos para publicação, com legenda em formato SRT queimada no vídeo, texto de apoio para caption e hashtags gerados por IA.

## Para quem e destinado

O produto atende criadores de conteúdo, agências de marketing e profissionais de redes sociais que produzem conteúdo de formato curto a partir de vídeos longos. O diferencial e a automação completa do fluxo — desde o download até a exportação final — sem necessidade de edição manual.

## Fluxo do usuario

```
1. Usuario cola a URL do YouTube na interface
2. Sistema faz o download do .mp4 completo via yt-dlp
3. Audio e extraído e transcrito pelo whisper.cpp (word-level timestamps)
4. Gemini 2.5 Flash analisa a transcricao e identifica de 3 a 8 momentos virais
5. FFmpeg corta, aplica crop 9:16, queima legendas e normaliza audio (loudnorm)
6. Sistema apresenta os cortes com thumbnail, titulo SEO, caption e hashtags
7. .mp4 bruto e deletado obrigatoriamente (sempre, inclusive em caso de erro)
8. Usuario baixa os arquivos: video_final.mp4, legenda .srt e copy.txt
```

## Stack completa

### Backend (`apps/api`)

| Camada | Tecnologia | Versao |
|---|---|---|
| Runtime | Node.js | >= 20.0.0 |
| Framework HTTP | Fastify | 5.x |
| Linguagem | TypeScript | 5.7 (strict) |
| Download de video | yt-dlp | sistema |
| Processamento de video | FFmpeg | sistema |
| Transcricao | whisper.cpp | porta 9000 |
| Analise de viralidade | Gemini 2.5 Flash | API Google |
| Validacao de schema | Zod | 3.x |
| Logger | Pino | 9.x |

### Frontend (`apps/web`)

| Camada | Tecnologia | Versao |
|---|---|---|
| Framework UI | React | 19.x |
| Build tool | Vite | 6.x |
| Estilizacao | Tailwind CSS | 4.x |
| Gerenciamento de estado | Zustand | 5.x |
| Roteamento | React Router | 7.x |
| Linguagem | TypeScript | 5.7 (strict) |

### Infraestrutura do monorepo

| Pacote | Funcao |
|---|---|
| Turborepo | Orquestrador de build e dev |
| pnpm workspaces | Gerenciador de dependencias |
| `@videoclipper/shared` | Contratos TypeScript compartilhados |
| `@videoclipper/tsconfig` | Configuracoes TypeScript base |
| `@videoclipper/eslint-config` | Configuracao ESLint compartilhada |

## Estrutura do monorepo

```
VideoClipper_v2/
├── apps/
│   ├── api/                         # Backend Fastify
│   │   └── src/
│   │       ├── config/              # env.ts (variaveis), constants.ts
│   │       ├── errors/              # Hierarquia AppError -> erros especificos
│   │       ├── pipeline/            # Orquestrador + 4 fases + ProgressEmitter
│   │       │   └── phases/          # ingestion, transcription, virality, editing
│   │       ├── routes/              # jobs.routes.ts, clips.routes.ts, health.routes.ts
│   │       ├── services/            # 8 servicos (ffmpeg, whisper, gemini, etc.)
│   │       ├── types/               # Extensoes de tipo do Fastify
│   │       └── utils/               # logger, retry, temp-dir
│   └── web/                         # Frontend React + Vite
│       └── src/
│           ├── components/          # 16 componentes organizados por dominio
│           │   ├── clips/           # ClipCard, ClipList
│           │   ├── feedback/        # EmptyState, ErrorState, SkeletonCard, Toast
│           │   ├── forms/           # VideoUrlInput
│           │   ├── layout/          # Header, PageContainer
│           │   ├── pipeline/        # PhaseProgress, PipelineStepper
│           │   └── ui/              # Badge, Button, Card, ProgressBar, Spinner
│           ├── hooks/               # useSSE, usePipelineProgress
│           ├── pages/               # HomePage, ProcessingPage, ResultsPage
│           ├── routes/              # Definicao de rotas React Router
│           ├── services/            # api.client.ts, sse.client.ts
│           ├── stores/              # pipeline.store.ts, job-history.store.ts
│           └── types/               # Re-exportacoes do @videoclipper/shared
├── packages/
│   ├── shared/                      # @videoclipper/shared — contratos e enums
│   │   └── src/
│   │       ├── contracts/           # job, clip, progress, whisper, gemini
│   │       ├── enums/               # JobStatus, PipelinePhase, PHASE_WEIGHTS
│   │       └── errors/              # ErrorCode
│   ├── tsconfig/                    # Configuracoes TypeScript reutilizaveis
│   └── eslint-config/               # Configuracao ESLint compartilhada
├── docs/                            # Esta documentacao
├── .env                             # Variaveis de ambiente (nao commitado)
├── package.json                     # Raiz do monorepo
├── pnpm-workspace.yaml
└── turbo.json
```

## Convencoes TypeScript e qualidade de codigo

- **TypeScript strict em todo o monorepo**: `"strict": true` em todas as configuracoes
- **Sem `any`**: o compilador rejeita o uso de `any` implícito ou explícito
- **`readonly` em interfaces**: todos os campos de contratos sao `readonly`
- **`ReadonlyArray<T>`**: arrays em contratos sao imutaveis
- **Principios SOLID**: separacao de responsabilidades, injecao de dependencias, classes coesas
- **Indentacao**: 2 espacos em todos os arquivos
- **Formatacao**: Prettier com configuracao compartilhada
- **Streams sobre buffers**: arquivos grandes sao processados via streams e `pipeline()`
- **Cleanup obrigatorio**: o .mp4 bruto e sempre deletado no bloco `finally`, sem excecao

## Comunicacao em tempo real

O sistema usa **Server-Sent Events (SSE)** para comunicar progresso do pipeline ao frontend. O endpoint `GET /api/jobs/:id/progress` mantem a conexao aberta e emite eventos `ProgressEvent` conforme cada fase avanca. O `ProgressEmitter` mantém um buffer de replay para que clientes que conectam apos o inicio recebam todos os eventos ja emitidos.

Para mais detalhes sobre o pipeline, consulte [Pipeline de Processamento](./04-pipeline-de-processamento.md).
Para a referencia completa da API, consulte [Referencia de API](./05-referencia-api.md).
Para o guia do frontend, consulte [Guia Frontend](./06-guia-frontend.md).
