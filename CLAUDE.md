# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VideoClipper v2 — SaaS for automated YouTube video clipping for social media. The core pipeline is: download full .mp4 → AI processing (Whisper transcription) + editing (FFmpeg) → present clips to user → mandatory deletion of raw .mp4.

## Architecture

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + Zustand + React Router 7
- **Backend**: Fastify 5 + Node.js + TypeScript (`strict: true`, no `any`)
- **Video processing**: FFmpeg via child process spawn (9:16 crop, subtitle burn-in, loudnorm)
- **Transcription**: whisper.cpp on Windows, auto-started by API on port 9000, flag `-l pt`, model `ggml-base`
- **Virality Analysis**: Gemini 2.5 Flash API (JSON mode, structured prompt)
- **Video Download**: yt-dlp (full .mp4, NOT audio-only)
- **Real-time progress**: Server-Sent Events (SSE), unidirectional
- **Shared types**: `@videoclipper/shared` package with all contracts/enums

## Core Video Pipeline (4 phases + mandatory cleanup)

```
Phase 1: Ingestion → yt-dlp download full .mp4 + metadata extraction
Phase 2: Transcription → Whisper API word-level timestamps
Phase 3: Virality Analysis → Gemini identifies viral clips (hook/development/conclusion)
Phase 4: Editing & Export → FFmpeg cuts + 9:16 crop + subtitle burn-in + loudnorm
finally: Cleanup → DELETE raw .mp4 (ALWAYS, even on error)
```

Pipeline orchestration: `PipelineOrchestrator` runs phases sequentially, each phase implements `PipelinePhaseHandler<TInput, TOutput>`. Progress emitted via `ProgressEmitter` (EventEmitter-based, weighted: Ingestion 15%, Transcription 20%, Virality 15%, Editing 50%).

Delivery per clip: `video_final.mp4` + `copy.txt` (title, caption, hashtags) + `transcricao_corte.srt`

## Commands

```bash
pnpm install                                    # Install all dependencies
pnpm turbo dev                                  # Start both API (3001) and web (5173)
pnpm turbo dev --filter=@videoclipper/api       # Start only backend
pnpm turbo dev --filter=@videoclipper/web       # Start only frontend
pnpm turbo build                                # Build all packages
pnpm turbo typecheck                            # TypeScript check all packages
pnpm turbo build --filter=@videoclipper/shared  # Build shared types only
pnpm format                                     # Prettier format all files
```

## Team Structure & Agent Coordination

The user acts as **Product Owner (PO)** and communicates primarily with the **tech-lead-manager**.

### Hierarchy

```
PO (user)
  └── tech-lead-manager (líder do projeto)
        ├── backend-video-engine (execução backend)
        └── frontend-ux-senior (execução frontend)
```

### Agent Roles

- **tech-lead-manager** — Líder do projeto. Recebe demandas do PO, analisa impacto, define arquitetura, decompõe tarefas e delega para os agentes de execução. Não escreve código a menos que solicitado. Coordena a integração entre frontend e backend.
- **frontend-ux-senior** — Executa tarefas de UI/UX delegadas pelo tech-lead. Regra de ouro: o usuário nunca pode ficar sem feedback visual (loading, progress bars, error states).
- **backend-video-engine** — Executa tarefas de backend delegadas pelo tech-lead. Node.js services, FFmpeg, Whisper, file cleanup.

### Workflow de Coordenação

1. **PO → Tech Lead**: O PO descreve a funcionalidade ou problema desejado.
2. **Tech Lead analisa**: Avalia impacto, define plano de ação, especifica schemas/interfaces e decompõe em tarefas.
3. **Tech Lead → Agentes**: Delega tarefas com especificações detalhadas (interfaces TypeScript, rotas de API, componentes, critérios de aceite).
4. **Agentes executam**: Implementam seguindo estritamente as especificações do Tech Lead.
5. **Agentes → Tech Lead**: Reportam TODAS as alterações realizadas — arquivos criados/modificados, decisões tomadas durante implementação, e quaisquer desvios das especificações.
6. **Tech Lead → PO**: Consolida os reports e apresenta o resultado ao PO.

### Regras de Coordenação

- Agentes de execução (frontend/backend) NÃO tomam decisões arquiteturais — escalam para o Tech Lead.
- Toda alteração de código deve ser reportada ao Tech Lead com: arquivos afetados, o que mudou, e por quê.
- O Tech Lead é responsável por garantir que frontend e backend estejam integrados (contratos de API, tipos compartilhados).
- Conflitos entre agentes são resolvidos pelo Tech Lead. Conflitos de prioridade são escalados ao PO.

## Conventions

- TypeScript strict mode across the entire monorepo
- 2-space indentation, Prettier/ESLint compliance
- SOLID principles, dependency injection, custom error classes
- Streams over buffers for large files; use `pipeline()` for safe composition
- All generated documentation goes in `docs/`
- All agents MUST confirm with the PO before taking significant actions

## Key Technical Decisions

- Use `readonly` for interface fields and `ReadonlyArray` for arrays in contracts
- Custom error types: `VideoDownloadError`, `FFmpegProcessingError`, `CleanupError`
- Retry logic + circuit breakers for external API calls (Whisper, download)
- Frontend: skeleton screens for loading, real progress bars with %, stepper for pipeline stages
