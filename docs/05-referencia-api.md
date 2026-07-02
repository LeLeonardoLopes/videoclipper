# Referencia de API — VideoClipper v2

A API do VideoClipper e um servidor Fastify 5 que escuta na porta 3001 (configuravel via `PORT`). Todos os endpoints REST estao sob o prefixo `/api`. As respostas seguem os contratos definidos em `@videoclipper/shared`.

Para os tipos TypeScript de request/response, consulte [Contratos Compartilhados](./07-contratos-compartilhados.md).
Para detalhes do pipeline que os jobs executam, consulte [Pipeline de Processamento](./04-pipeline-de-processamento.md).

---

## Base URL

```
http://localhost:3001
```

Em producao, o frontend e servido pelo mesmo servidor (ou proxy reverso), permitindo requisicoes relativas a `/api`.

---

## Endpoints

### GET /api/health

Verifica se o servidor esta em execucao.

**Autenticacao**: nenhuma

**Resposta 200:**

```json
{
  "status": "ok",
  "timestamp": "2026-04-14T12:00:00.000Z"
}
```

---

### POST /api/jobs

Cria um novo job de corte automatizado. O pipeline e iniciado de forma assincrona — a resposta e retornada imediatamente com o `jobId` enquanto o processamento ocorre em background.

**Content-Type**: `application/json`

**Request body:**

```json
{
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

| Campo | Tipo | Obrigatorio | Validacao |
|---|---|---|---|
| `videoUrl` | string | Sim | Deve corresponder ao padrao `(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[a-zA-Z0-9_-]{11}` |

**Resposta 201 — sucesso:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "QUEUED",
  "createdAt": "2026-04-14T12:00:00.000Z"
}
```

**Resposta 400 — URL invalida:**

```json
{
  "error": "Validation error",
  "message": "Invalid YouTube URL",
  "statusCode": 400
}
```

---

### GET /api/jobs/:id

Retorna o estado completo de um job, incluindo metadados do video e lista de cortes quando disponivel.

**Parametros de rota:**

| Parametro | Tipo | Descricao |
|---|---|---|
| `id` | string (UUID) | ID do job retornado pelo `POST /api/jobs` |

**Resposta 200 — job em processamento:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING",
  "videoMetadata": {
    "title": "Como construir uma startup do zero",
    "channel": "TechTalks",
    "durationSeconds": 3247,
    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
  },
  "clips": [],
  "createdAt": "2026-04-14T12:00:00.000Z",
  "completedAt": null,
  "error": null
}
```

**Resposta 200 — job concluido:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  "videoMetadata": {
    "title": "Como construir uma startup do zero",
    "channel": "TechTalks",
    "durationSeconds": 3247,
    "thumbnailUrl": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
  },
  "clips": [
    {
      "clipId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "index": 0,
      "startSeconds": 142,
      "endSeconds": 207,
      "durationSeconds": 65,
      "seoTitle": "O segredo que todo fundador precisa saber antes de lançar",
      "description": "Neste trecho, o fundador revela o principal erro que cometeu...",
      "hashtags": ["#startup", "#empreendedorismo", "#dicas"],
      "whyChosen": "Gancho forte com revelacao de segredo nos primeiros 3s...",
      "thumbnailUrl": "/api/jobs/550e8400.../clips/0/download/thumbnail",
      "videoUrl": "/api/jobs/550e8400.../clips/0/download/video",
      "copyUrl": "/api/jobs/550e8400.../clips/0/download/copy",
      "srtUrl": "/api/jobs/550e8400.../clips/0/download/srt"
    }
  ],
  "createdAt": "2026-04-14T12:00:00.000Z",
  "completedAt": "2026-04-14T12:08:32.000Z",
  "error": null
}
```

**Resposta 200 — job com falha:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "videoMetadata": null,
  "clips": [],
  "createdAt": "2026-04-14T12:00:00.000Z",
  "completedAt": "2026-04-14T12:01:15.000Z",
  "error": "yt-dlp download failed with code 1"
}
```

**Resposta 404 — job nao encontrado:**

```json
{
  "error": "Job not found",
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

### GET /api/jobs/:id/progress

Endpoint SSE (Server-Sent Events) para acompanhar o progresso do pipeline em tempo real. A conexao permanece aberta e eventos sao enviados conforme o pipeline avanca.

**Parametros de rota:**

| Parametro | Tipo | Descricao |
|---|---|---|
| `id` | string (UUID) | ID do job |

**Headers de resposta:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

**Formato dos eventos:**

Cada evento segue o formato SSE padrao:

```
data: <JSON do ProgressEvent>\n\n
```

**Exemplo de sequencia de eventos:**

```
data: {"jobId":"550e8...","phase":"INGESTION","status":"started","percentage":0,"overallPercentage":0,"message":"Iniciando download do video...","timestamp":"2026-04-14T12:00:01.000Z"}

data: {"jobId":"550e8...","phase":"INGESTION","status":"progress","percentage":45,"overallPercentage":6,"message":"Baixando video... 45%","timestamp":"2026-04-14T12:00:15.000Z"}

data: {"jobId":"550e8...","phase":"INGESTION","status":"completed","percentage":100,"overallPercentage":15,"message":"Download concluido!","timestamp":"2026-04-14T12:01:30.000Z"}

data: {"jobId":"550e8...","phase":"TRANSCRIPTION","status":"started","percentage":0,"overallPercentage":15,"message":"Extraindo audio do video...","timestamp":"2026-04-14T12:01:30.000Z"}

data: {"jobId":"550e8...","phase":"EDITING_EXPORT","status":"completed","percentage":100,"overallPercentage":100,"message":"5 cortes exportados com sucesso!","timestamp":"2026-04-14T12:08:30.000Z"}
```

**Comportamento da conexao:**

- A conexao se encerra automaticamente quando o ultimo evento tem `status === 'completed'` e `overallPercentage >= 100`, ou quando `status === 'failed'`
- Se o cliente conecta apos o inicio do pipeline, o servidor replaya todos os eventos ja emitidos (buffer de replay do `ProgressEmitter`)
- Se o cliente desconecta, o servidor remove o listener e o emitter da `jobEmitters` map

**Resposta 404 — job nao encontrado ou ja encerrado:**

```json
{
  "error": "Job not found or already completed",
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Estrutura completa do ProgressEvent:**

```typescript
interface ProgressEvent {
  jobId: string;
  phase: 'INGESTION' | 'TRANSCRIPTION' | 'VIRALITY_ANALYSIS' | 'EDITING_EXPORT' | 'CLEANUP';
  status: 'started' | 'progress' | 'completed' | 'failed';
  percentage: number;        // Progresso da fase atual (0-100)
  overallPercentage: number; // Progresso global ponderado (0-100)
  message: string;
  timestamp: string;         // ISO 8601
}
```

---

### GET /api/jobs/:jobId/clips/:clipIndex/download/:fileType

Faz o download de um dos arquivos gerados para um corte especifico. Usa streaming de arquivo (`createReadStream`) para eficiencia.

**Parametros de rota:**

| Parametro | Tipo | Descricao |
|---|---|---|
| `jobId` | string (UUID) | ID do job |
| `clipIndex` | string | Indice do corte (ex: `0`, `1`, `2`) |
| `fileType` | string | Tipo do arquivo (ver tabela abaixo) |

**Tipos de arquivo disponiveis:**

| `fileType` | Nome do arquivo | Content-Type | Content-Disposition |
|---|---|---|---|
| `video` | `clip_N.mp4` | `video/mp4` | `attachment; filename="clip_N.mp4"` |
| `copy` | `clip_N_copy.txt` | `text/plain; charset=utf-8` | `attachment; filename="clip_N_copy.txt"` |
| `srt` | `clip_N.srt` | `application/x-subrip` | `attachment; filename="clip_N.srt"` |
| `thumbnail` | `clip_N_thumb.jpg` | `image/jpeg` | `inline` |

O arquivo `.srt` e lido de `<OUTPUT_DIR>/<jobId>/srt/clip_N.srt`. Os demais sao lidos de `<OUTPUT_DIR>/<jobId>/clip_N.*`.

**Resposta 200 — sucesso:**

Stream binario do arquivo com headers `Content-Type`, `Content-Length` e `Content-Disposition` configurados.

**Resposta 400 — tipo invalido:**

```json
{
  "error": "Invalid file type. Use: video, copy, srt, thumbnail"
}
```

**Resposta 404 — arquivo nao encontrado:**

```json
{
  "error": "File not found",
  "filePath": "550e8400.../clip_0"
}
```

---

## Tratamento de erros global

O Fastify tem um error handler global registrado em `server.ts`. Qualquer erro nao tratado e convertido para a resposta padrao:

```json
{
  "error": "NomeDoErro",
  "message": "Mensagem descritiva",
  "statusCode": 500
}
```

Erros derivados de `AppError` (ver [Tratamento de Erros](./08-tratamento-de-erros.md)) preservam o `statusCode` definido na classe.

---

## CORS

O servidor permite requisicoes de qualquer origem (`origin: true`) com metodos `GET` e `POST`. Isso e configurado via `@fastify/cors` e adequado para desenvolvimento. Em producao, restrinja para a origem do frontend.

---

## Extensao do tipo FastifyInstance

O servidor decora a instancia Fastify com `jobEmitters`, um `Map` que associa cada `jobId` ao seu `ProgressEmitter`:

```typescript
// apps/api/src/types/fastify.d.ts
declare module 'fastify' {
  interface FastifyInstance {
    jobEmitters: Map<string, ProgressEmitter>;
  }
}
```

Isso permite que o endpoint SSE (`/progress`) acesse o emitter do job sem acoplamento ao orquestrador.
