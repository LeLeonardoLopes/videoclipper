# 🎬 VideoClipper

> SaaS de geração automática de cortes virais a partir de vídeos longos do YouTube — download, transcrição por IA, seleção de momentos virais e edição final em formato 9:16, tudo sem edição manual.

<p align="left">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white">
  <img alt="Fastify" src="https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black">
  <img alt="Turborepo" src="https://img.shields.io/badge/Monorepo-Turborepo%20%2B%20pnpm-EF4444?logo=turborepo&logoColor=white">
</p>

---

## 📌 O problema

Um único vídeo longo do YouTube contém dezenas de "momentos virais" que renderiam Reels, Shorts e TikToks — mas encontrá-los, cortá-los, reenquadrar para 9:16, legendar e escrever a copy é um trabalho manual de horas. O **VideoClipper** transforma esse fluxo inteiro em uma única ação: **cole a URL, receba os cortes prontos para publicar.**

## ✨ O que ele faz

Dado o link de um vídeo do YouTube, o sistema entrega, para cada corte:

| Arquivo | Conteúdo |
|---|---|
| `video_final.mp4` | Corte em 9:16, com legendas queimadas e áudio normalizado |
| `copy.txt` | Título com apelo de SEO, caption e hashtags gerados por IA |
| `transcricao_corte.srt` | Legenda do corte em formato SRT |

E acompanha todo o processamento em **tempo real** com uma barra de progresso fiel a cada etapa.

---

## 🧠 O pipeline de processamento

O núcleo do produto é um pipeline de 4 fases sequenciais, orquestrado por um `PipelineOrchestrator`. Cada fase implementa a mesma interface (`PipelinePhaseHandler<TInput, TOutput>`), o que torna o fluxo composável e testável.

```
┌───────────────┐   ┌────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ 1. Ingestão   │──▶│ 2. Transcrição │──▶│ 3. Análise viral │──▶│ 4. Edição/Export │
│  yt-dlp .mp4  │   │  whisper.cpp   │   │  Gemini 2.5 Flash│   │  FFmpeg 9:16     │
│  + metadados  │   │  timestamps/   │   │  3–8 cortes      │   │  legenda+loudnorm│
│               │   │  palavra (PT)  │   │  hook/dev/conclus│   │                  │
└───────────────┘   └────────────────┘   └──────────────────┘   └──────────────────┘
        │                                                                 │
        └──────────────────────────  finally  ────────────────────────────┘
                     🗑️  Limpeza OBRIGATÓRIA do .mp4 bruto
                        (executa SEMPRE, inclusive em erro)
```

**Peso de progresso ponderado** — a barra reflete o custo real de cada etapa, não uma média ingênua:

| Fase | Peso |
|---|---|
| Ingestão | 15% |
| Transcrição | 20% |
| Análise de viralidade | 15% |
| Edição & Export | 50% |

---

## 🏛️ Decisões de engenharia (o que este projeto demonstra)

- **Limpeza garantida no `finally`** — o `.mp4` bruto é deletado em *todos* os caminhos de execução, mesmo em falha. É uma regra de custo de armazenamento e privacidade codificada no fluxo de controle, não deixada para "lembrar depois".
- **Progresso em tempo real via Server-Sent Events** — comunicação unidirecional servidor→cliente (mais simples que WebSocket para este caso). O `ProgressEmitter` mantém um **buffer de replay**: clientes que conectam após o início recebem todos os eventos já emitidos, sem "buracos" na barra de progresso.
- **Contratos compartilhados como fonte única da verdade** — o pacote `@videoclipper/shared` centraliza interfaces, enums e códigos de erro consumidos por back e front, eliminando divergência de tipos entre as pontas.
- **TypeScript `strict` sem `any`** em todo o monorepo, com `readonly` e `ReadonlyArray` nos contratos para imutabilidade.
- **Hierarquia de erros customizada** — `AppError` como base, especializada em `VideoDownloadError`, `FFmpegProcessingError`, `TranscriptionError`, `GeminiError`, `CleanupError`.
- **Resiliência em chamadas externas** — utilitário de retry para as integrações voláteis (download, Whisper, Gemini).
- **Streams sobre buffers** para arquivos grandes de vídeo.

---

## 🧱 Stack

**Backend (`apps/api`)** · Fastify 5 · Node ≥20 · TypeScript strict · Zod (validação) · Pino (logs) · yt-dlp · FFmpeg · whisper.cpp · Gemini 2.5 Flash

**Frontend (`apps/web`)** · React 19 · Vite 6 · Tailwind CSS 4 · Zustand 5 · React Router 7

**Monorepo** · Turborepo · pnpm workspaces · `@videoclipper/shared` (contratos) · configs de tsconfig/eslint compartilhadas

---

## 📂 Estrutura

```
VideoClipper/
├── apps/
│   ├── api/                    # Backend Fastify
│   │   └── src/
│   │       ├── pipeline/       # Orquestrador + 4 fases + ProgressEmitter
│   │       ├── services/       # ffmpeg, whisper, gemini, downloader, cleanup…
│   │       ├── routes/         # jobs, clips, health
│   │       ├── errors/         # Hierarquia AppError
│   │       └── utils/          # logger, retry, temp-dir
│   └── web/                    # Frontend React + Vite
│       └── src/
│           ├── pages/          # Home, Processing, Results
│           ├── components/     # ui, feedback, pipeline, clips, forms, layout
│           ├── hooks/          # useSSE, usePipelineProgress
│           └── stores/         # pipeline, job-history (Zustand)
└── packages/
    ├── shared/                 # @videoclipper/shared — contratos e enums
    ├── tsconfig/               # tsconfig base
    └── eslint-config/          # ESLint compartilhado
```

---

## 🔌 API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/jobs` | Cria um job de clipagem a partir de uma URL do YouTube (validada por Zod) |
| `GET` | `/api/jobs/:id` | Retorna status e resultados do job |
| `GET` | `/api/jobs/:id/progress` | **SSE** — stream de progresso em tempo real, com replay de eventos |
| `GET` | `/api/clips/...` | Acesso aos arquivos de corte gerados |
| `GET` | `/health` | Health check |

<details>
<summary>Exemplo — criar um job</summary>

```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{ "videoUrl": "https://www.youtube.com/watch?v=..." }'
# → 201 { "jobId": "...", "status": "queued", "createdAt": "..." }
```

Em seguida, conecte ao stream de progresso:

```bash
curl -N http://localhost:3001/api/jobs/<jobId>/progress
# data: {"phase":"transcription","status":"started","overallPercentage":18,...}
```
</details>

---

## 🚀 Começando

### Pré-requisitos

- **Node.js** ≥ 20 e **pnpm** 9
- **FFmpeg** e **yt-dlp** disponíveis no `PATH`
- **whisper.cpp** (`whisper-server`) + um modelo ggml (ex.: `ggml-base.bin`)
- Uma **API key do Gemini**

### Instalação

```bash
pnpm install                 # instala todas as dependências do monorepo
cp .env.example .env         # configure as variáveis (ver abaixo)
```

### Variáveis de ambiente (`.env`)

```bash
# Whisper (whisper.cpp)
WHISPER_API_URL=http://localhost:9000
WHISPER_LANGUAGE=pt
WHISPER_SERVER_PATH=         # caminho do whisper-server (vazio = modo manual)
WHISPER_MODEL_PATH=          # caminho do modelo ggml

# Gemini
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash

# Servidor
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Paths / processamento
OUTPUT_DIR=./output
FFMPEG_CONCURRENCY=2
YTDLP_PATH=yt-dlp
```

### Rodando

```bash
pnpm dev                                    # sobe API (3001) + web (5173)
pnpm dev --filter=@videoclipper/api         # somente backend
pnpm dev --filter=@videoclipper/web         # somente frontend

pnpm build                                  # build de todos os pacotes
pnpm typecheck                              # checagem de tipos
pnpm format                                 # Prettier
```

---

## 🗺️ Roadmap

- [ ] Persistência dos jobs em banco de dados (hoje o store é em memória)
- [ ] Autenticação e planos de uso (SaaS multi-tenant)
- [ ] Fila de processamento distribuída para jobs concorrentes
- [ ] Testes automatizados de ponta a ponta do pipeline

---

## 📄 Licença

Projeto de portfólio. Sinta-se livre para explorar o código e as decisões de arquitetura.
