# Tratamento de Erros — VideoClipper v2

O VideoClipper adota uma hierarquia de erros estruturada que garante respostas HTTP consistentes, codigos de erro tipados e rastreabilidade em logs. Esta pagina documenta a hierarquia de classes, o mapeamento para codigos HTTP, a logica de retry e como os erros chegam ao frontend.

Para os codigos de erro definidos no pacote compartilhado, consulte [Contratos Compartilhados](./07-contratos-compartilhados.md).
Para entender onde cada erro pode ocorrer no fluxo, consulte [Pipeline de Processamento](./04-pipeline-de-processamento.md).

---

## Hierarquia de classes de erro

```
Error (JavaScript nativo)
└── AppError                          base.error.ts
    ├── VideoDownloadError            video-download.error.ts
    ├── VideoInvalidUrlError          video-download.error.ts
    ├── TranscriptionError            transcription.error.ts
    ├── TranscriptionTimeoutError     transcription.error.ts
    ├── GeminiAnalysisError           gemini.error.ts
    ├── FFmpegProcessingError         ffmpeg-processing.error.ts
    └── CleanupError                  cleanup.error.ts
```

### AppError (classe base)

```typescript
// apps/api/src/errors/base.error.ts
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

Todo erro de dominio do VideoClipper estende `AppError`. Os campos sao:

| Campo | Tipo | Descricao |
|---|---|---|
| `code` | `ErrorCode` | Codigo maquina-legivel, tipado pelo enum compartilhado |
| `message` | string | Mensagem humano-legivel |
| `statusCode` | number | HTTP status code a ser retornado (padrao: 500) |
| `details` | `Record<string, unknown>` | Contexto adicional para debugging (opcional) |

---

## Mapeamento ErrorCode para classe e HTTP status

| `ErrorCode` | Classe | HTTP Status | Quando ocorre |
|---|---|---|---|
| `VIDEO_DOWNLOAD_FAILED` | `VideoDownloadError` | 502 | yt-dlp retorna codigo de saida nao-zero |
| `VIDEO_INVALID_URL` | `VideoInvalidUrlError` | 400 | URL nao corresponde ao regex do YouTube |
| `VIDEO_TOO_LONG` | — (nao implementado ainda) | — | Reservado para videos acima de 1h |
| `TRANSCRIPTION_FAILED` | `TranscriptionError` | 502 | Whisper retorna HTTP nao-OK, ou ECONNREFUSED |
| `TRANSCRIPTION_TIMEOUT` | `TranscriptionTimeoutError` | 504 | Whisper nao responde dentro de 300s |
| `GEMINI_ANALYSIS_FAILED` | `GeminiAnalysisError` | 502 | Todos os modelos Gemini falharam |
| `GEMINI_RATE_LIMITED` | — (dentro do GeminiAnalysisError) | — | Reservado |
| `FFMPEG_PROCESSING_FAILED` | `FFmpegProcessingError` | 500 | FFmpeg retorna codigo de saida nao-zero |
| `FFMPEG_INVALID_TIMESTAMPS` | — (nao implementado ainda) | — | Reservado |
| `CLEANUP_FAILED` | `CleanupError` | 500 | rm -rf do tempDir falhou |
| `JOB_NOT_FOUND` | — (resposta direta) | 404 | Job nao existe no store em memoria |

---

## Classes de erro — detalhamento

### VideoDownloadError e VideoInvalidUrlError

```typescript
// apps/api/src/errors/video-download.error.ts
export class VideoDownloadError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.VIDEO_DOWNLOAD_FAILED, message, 502, details);
  }
}

export class VideoInvalidUrlError extends AppError {
  constructor(url: string) {
    super(ErrorCode.VIDEO_INVALID_URL, `Invalid YouTube URL: ${url}`, 400, { url });
  }
}
```

`VideoDownloadError` e lancada quando o yt-dlp encerra com codigo nao-zero. O campo `details` inclui o stderr do processo para diagnostico. `VideoInvalidUrlError` e lancada antes de qualquer chamada externa quando a URL nao corresponde ao padrao esperado.

### TranscriptionError e TranscriptionTimeoutError

```typescript
// apps/api/src/errors/transcription.error.ts
export class TranscriptionError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.TRANSCRIPTION_FAILED, message, 502, details);
  }
}

export class TranscriptionTimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super(
      ErrorCode.TRANSCRIPTION_TIMEOUT,
      `Transcription timed out after ${timeoutMs}ms`,
      504,
      { timeoutMs },
    );
  }
}
```

`TranscriptionError` cobre dois cenarios: resposta HTTP nao-OK do Whisper (ex: 500) e `ECONNREFUSED` quando o servidor nao esta em execucao. O segundo caso inclui uma mensagem amigavel indicando a URL esperada.

`TranscriptionTimeoutError` e lancada quando o `AbortController` dispara apos `WHISPER_TIMEOUT_MS` (300 segundos).

### GeminiAnalysisError

```typescript
// apps/api/src/errors/gemini.error.ts
export class GeminiAnalysisError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.GEMINI_ANALYSIS_FAILED, message, 502, details);
  }
}
```

Lancada pelo `GeminiService` apenas quando todos os modelos (primario + fallback) falharam. O campo `details` inclui o `videoTitle` e o nome do `model` que causou a falha.

### FFmpegProcessingError

```typescript
// apps/api/src/errors/ffmpeg-processing.error.ts
export class FFmpegProcessingError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.FFMPEG_PROCESSING_FAILED, message, 500, details);
  }
}
```

Lancada quando o FFmpeg encerra com codigo nao-zero. O `details` inclui os ultimos 500 caracteres do stderr para diagnostico sem sobrecarregar o log.

### CleanupError

```typescript
// apps/api/src/errors/cleanup.error.ts
export class CleanupError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.CLEANUP_FAILED, message, 500, details);
  }
}
```

Definida, mas o `CleanupService` deliberadamente **nao a lanca**. O cleanup captura excecoes e apenas as loga. Isso garante que um erro de cleanup nao sobrescreva o status final do job (COMPLETED ou FAILED).

---

## Retry com backoff exponencial

A funcao `withRetry` em `apps/api/src/utils/retry.ts` implementa retry configuravel com backoff exponencial:

```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<T>
```

### Configuracao padrao

```typescript
const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};
```

### Calculo do delay

```
delay = min(baseDelayMs * 2^(attempt - 1), maxDelayMs)
```

Sequencia com os valores padrao (baseDelay=1000ms, maxDelay=10000ms):
- Tentativa 1: falhou → aguarda 1000ms
- Tentativa 2: falhou → aguarda 2000ms
- Tentativa 3: falhou → lanca excecao

### Uso por servico

| Servico | maxAttempts | baseDelayMs | shouldRetry |
|---|---|---|---|
| `WhisperService` | 3 | 2000 | Nao retentar `TranscriptionError` (resposta invalida) |
| `GeminiService` | 2 | 3000 | Sem filtro (qualquer erro retenta) |

O `shouldRetry` permite excluir erros que nao se beneficiam de retry. Por exemplo, um erro 400 do Whisper (parametros invalidos) nunca vai melhorar com retry — ao contrario de um erro de rede transiente.

### Comportamento em falha total

Quando todas as tentativas se esgotam, o erro original da ultima tentativa e relancado. O `logger.error` registra o numero de tentativas e o label para rastreabilidade.

---

## Fallback de modelo Gemini

O `GeminiService` implementa um mecanismo de fallback por modelo:

```typescript
// Sequencia de modelos tentados
const models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL]  // ['gemini-2.5-flash', 'gemini-2.0-flash']

for (let i = 0; i < models.length; i++) {
  try {
    return await withRetry(() => this.sendToGemini(request, models[i]), ...)
  } catch (error) {
    const isServiceError = error inclui '503' || '429' || 'overloaded'
    if (isServiceError && hasNextModel) {
      continue  // tenta proximo modelo
    }
    throw error  // erro nao-transiente ou sem mais modelos
  }
}
```

O fallback so e ativado para erros de servico (sobrecarga, rate limiting). Erros de configuracao (chave invalida, prompt malformado) propagam imediatamente sem tentar o modelo alternativo.

---

## Error handler global do Fastify

O servidor registra um error handler global em `apps/api/src/server.ts`:

```typescript
server.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
  logger.error({ error }, 'Unhandled error');
  const statusCode = error.statusCode ?? 500;
  reply.status(statusCode).send({
    error: error.name,
    message: error.message,
    statusCode,
  });
});
```

Este handler:
1. Loga o erro completo (incluindo stack trace) via Pino
2. Usa `error.statusCode` se disponivel (propriedade de `AppError`)
3. Retorna JSON padrao com `error`, `message` e `statusCode`

Para erros do pipeline, o handler global raramente e acionado pois o `PipelineOrchestrator` captura todas as excecoes e armazena em `state.error`. O handler global cobre erros de validacao do Fastify e erros inesperados nas rotas.

---

## Erros no frontend

O frontend nao tem hierarquia de classes de erro — consome as mensagens e reage visualmente.

### Erros de requisicao HTTP

O `apiClient` lanca `Error` para qualquer resposta HTTP nao-2xx:

```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(...)
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }
  return response.json()
}
```

Na `HomePage`, o erro e capturado e exibido via `useToastStore`:

```typescript
try {
  const response = await apiClient.createJob({ videoUrl: url })
  // sucesso
} catch (error) {
  toast.add('error', error instanceof Error ? error.message : 'Falha ao criar job')
}
```

### Erros de pipeline (SSE)

Quando o backend emite um `ProgressEvent` com `status === 'failed'`, o `usePipelineStore.updateProgress` marca o status como `FAILED`. A `ProcessingPage` detecta isso e renderiza `ErrorState`:

```typescript
if (progress.error && progress.status === JobStatus.FAILED) {
  return (
    <PageContainer maxWidth="md">
      <ErrorState
        title="Processamento falhou"
        message="Ocorreu um erro durante o processamento do video. Por favor, tente novamente."
        onRetry={() => navigate('/')}
      />
    </PageContainer>
  )
}
```

### Erros de carregamento de resultados

Na `ResultsPage`, erros ao buscar o job sao capturados e exibidos via `ErrorState` com `window.location.reload()` como acao de retry:

```typescript
.catch((err) => {
  setError(err instanceof Error ? err.message : 'Falha ao carregar resultados')
})
```

### Componente ErrorState

Aceita `title` (opcional), `message` (obrigatorio) e `onRetry` (opcional). Quando `onRetry` e fornecido, exibe o botao "Tentar novamente".

### Componente Toast

Notificacoes transientes no canto inferior direito. Auto-removidas apos 5 segundos. Suporta 4 tipos: `success`, `error`, `warning`, `info`. Uso principal: erros de `POST /api/jobs`.

---

## Resumo: o que fazer quando um erro ocorre

| Onde o erro ocorre | O que acontece |
|---|---|
| Validacao da URL no frontend | Mensagem de erro inline no `VideoUrlInput` |
| `POST /api/jobs` retorna 400 | Toast de erro na `HomePage` |
| `POST /api/jobs` retorna 5xx | Toast de erro na `HomePage` |
| Pipeline — qualquer fase | `ProgressEvent` com `status: 'failed'`, `ErrorState` na `ProcessingPage` |
| `GET /api/jobs/:id` retorna 404 | `ErrorState` na `ResultsPage` |
| Download de arquivo — 404 | O link quebra silenciosamente; arquivo nao existe em disco |
| Cleanup falha | Logado no servidor; nao visivel ao usuario; job mantem status final |
