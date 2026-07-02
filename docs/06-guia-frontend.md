# Guia Frontend — VideoClipper v2

O frontend do VideoClipper e uma Single Page Application construida com React 19, Vite 6, Tailwind CSS 4 e Zustand 5. O principio central de UX e que o usuario **nunca pode ficar sem feedback visual** — todo estado assincrono tem loading, progresso ou skeleton correspondente.

Para os tipos usados neste guia, consulte [Contratos Compartilhados](./07-contratos-compartilhados.md).
Para os endpoints da API consumidos pelo frontend, consulte [Referencia de API](./05-referencia-api.md).

---

## Estrutura de `apps/web/src/`

```
apps/web/src/
├── App.tsx                          # Raiz: BrowserRouter + Header + AppRoutes + Toast
├── main.tsx                         # Ponto de entrada React
├── styles/globals.css               # Tailwind v4 directives + variaveis CSS
├── types/index.ts                   # Re-exportacoes de @videoclipper/shared
├── routes/
│   └── index.tsx                    # Definicao das 3 rotas com React Router 7
├── pages/
│   ├── HomePage.tsx                 # Pagina inicial — input de URL
│   ├── ProcessingPage.tsx           # Pagina de progresso — SSE + stepper
│   └── ResultsPage.tsx              # Pagina de resultados — grid de cortes
├── stores/
│   ├── pipeline.store.ts            # Estado do pipeline ativo (Zustand)
│   └── job-history.store.ts         # Historico persistido (Zustand + persist)
├── hooks/
│   ├── useSSE.ts                    # Conexao SSE via EventSource
│   └── usePipelineProgress.ts       # Composicao: useSSE + pipeline store
├── services/
│   ├── api.client.ts                # HTTP client (createJob, getJob)
│   └── sse.client.ts                # Factory de EventSource
└── components/
    ├── clips/
    │   ├── ClipCard.tsx             # Card individual de corte
    │   └── ClipList.tsx             # Grid de ClipCards
    ├── feedback/
    │   ├── EmptyState.tsx           # Estado vazio generico
    │   ├── ErrorState.tsx           # Estado de erro com botao de retry
    │   ├── SkeletonCard.tsx         # Placeholder animado de loading
    │   └── Toast.tsx                # Notificacoes flutuantes (store + componente)
    ├── forms/
    │   └── VideoUrlInput.tsx        # Input + validacao + botao submit
    ├── layout/
    │   ├── Header.tsx               # Cabecalho global com logo e nav
    │   └── PageContainer.tsx        # Wrapper com max-width e padding
    ├── pipeline/
    │   ├── PhaseProgress.tsx        # Barras de progresso (geral + fase)
    │   └── PipelineStepper.tsx      # Stepper visual das 4 fases
    └── ui/
        ├── Badge.tsx                # Badge de status/tag
        ├── Button.tsx               # Botao com variantes e estado loading
        ├── Card.tsx                 # Container com borda, sombra, padding
        ├── ProgressBar.tsx          # Barra de progresso com label e %
        └── Spinner.tsx              # Spinner SVG animado
```

---

## Fluxo de navegacao

```
/                     HomePage
  │
  └── usuario submete URL valida
        │
        ├── apiClient.createJob() → POST /api/jobs
        ├── usePipelineStore.setJobId()
        └── navigate('/processing/:jobId')
              │
              ProcessingPage
                │
                ├── usePipelineProgress(jobId) → SSE aberto
                ├── PipelineStepper (4 fases)
                ├── PhaseProgress (barras %)
                │
                └── progress.status === COMPLETED
                      │
                      ├── apiClient.getJob(jobId)
                      ├── store.setResult(metadata, clips)
                      ├── history.addEntry(...)
                      └── navigate('/results/:jobId')
                            │
                            ResultsPage
                              └── ClipList → ClipCard x N
```

---

## Paginas

### HomePage (`/`)

Responsavel por receber a URL do YouTube e iniciar o job.

**Componentes utilizados**: `PageContainer`, `VideoUrlInput`, `Card`

**Fluxo interno**:
1. `VideoUrlInput.onSubmit` e chamado com a URL validada localmente
2. `loading = true`, `reset()` no store
3. `apiClient.createJob({ videoUrl })` → recebe `{ jobId }`
4. `setJobId(jobId)`, `navigate('/processing/:jobId')`
5. Em caso de erro: `useToastStore.add('error', message)`

**Historico recente**: exibe ate 5 entradas do `useJobHistoryStore`, clicaveis para navegar para `/results/:jobId`.

### ProcessingPage (`/processing/:jobId`)

Exibe o progresso do pipeline em tempo real.

**Componentes utilizados**: `PageContainer`, `Card`, `PipelineStepper`, `PhaseProgress`, `ErrorState`

**Fluxo interno**:
1. `usePipelineProgress(jobId)` abre a conexao SSE
2. Cada evento SSE atualiza o store via `store.updateProgress(event)`
3. `PipelineStepper` reflete fases completas e a fase atual
4. `PhaseProgress` exibe dois `ProgressBar`: progresso geral e da fase corrente
5. Quando `progress.status === COMPLETED`: busca o job completo, salva no store, adiciona ao historico e navega para resultados
6. Quando `progress.status === FAILED`: exibe `ErrorState` com botao de retry que navega para `/`

### ResultsPage (`/results/:jobId`)

Exibe os cortes gerados.

**Componentes utilizados**: `PageContainer`, `ClipList`, `ClipCard`, `ErrorState`, `SkeletonCard`, `Badge`, `Button`

**Fluxo interno**:
1. Se o store ja tem os clips do mesmo jobId, usa sem fazer nova requisicao
2. Caso contrario, `apiClient.getJob(jobId)` busca o resultado
3. Durante carregamento: 4x `SkeletonCard`
4. Em caso de erro: `ErrorState` com retry via `window.location.reload()`
5. Sucesso: cabecalho com titulo, canal e badge de contagem + `ClipList`

---

## Componentes — detalhamento por dominio

### Dominio: clips

#### ClipCard

**Props**: `{ clip: ClipResult }`

Exibe um corte individual com:
- Thumbnail 9:16 (`img` com fallback de ocultacao em erro)
- Overlay com numero do corte e duracao formatada
- Titulo SEO completo (sem truncamento)
- Timestamp de inicio e fim no formato `M:SS - M:SS`
- Descricao com expand/collapse (threshold: 120 caracteres)
- Todas as hashtags como `Badge variant="primary"`
- Secao "Por que este corte?" expansivel com chevron animado
- 3 botoes de download: video (.mp4), legenda (.srt), texto (.txt)

**Estado local**: `descExpanded: boolean`, `whyExpanded: boolean`

#### ClipList

**Props**: `{ clips: ReadonlyArray<ClipResult> }`

Grid responsivo 1 coluna (mobile) / 2 colunas (md+). Se `clips.length === 0`, exibe `EmptyState`.

### Dominio: feedback

#### EmptyState

**Props**: `{ icon?: ReactNode; title: string; description: string; action?: ReactNode }`

Componente de estado vazio generico, centralizado verticalmente.

#### ErrorState

**Props**: `{ title?: string; message: string; onRetry?: () => void }`

Exibe icone de erro, titulo (padrao: "Algo deu errado"), mensagem e botao opcional de retry.

#### SkeletonCard

Sem props. Placeholder animado (`animate-pulse`) com proporoes similares a um `ClipCard`. Usado em `ResultsPage` durante carregamento.

#### Toast

Combina store e componente no mesmo arquivo.

**`useToastStore`**: store Zustand com `add(type, message)` e `remove(id)`. Cada toast auto-remove apos 5 segundos.

**`Toast` (componente)**: renderiza a pilha de toasts no canto inferior direito da tela (`fixed bottom-4 right-4`). Suporta 4 tipos: `success`, `error`, `warning`, `info`.

### Dominio: forms

#### VideoUrlInput

**Props**: `{ onSubmit: (url: string) => void; loading?: boolean }`

Input de URL com validacao local via regex do YouTube antes de chamar `onSubmit`. Exibe mensagem de erro inline e desabilita o botao durante `loading`. O botao exibe spinner quando `loading = true`.

### Dominio: layout

#### Header

Sem props. Cabecalho fixo com logo VideoClipper (link para `/`) e navegacao "Novo Corte". Faz parte do layout raiz do `App.tsx`.

#### PageContainer

**Props**: `{ children: ReactNode; maxWidth?: 'sm' | 'md' | 'lg' | 'xl' }`

Wrapper de pagina com `max-width` configuravel (padrao: `lg` = `max-w-6xl`) e padding horizontal responsivo.

### Dominio: pipeline

#### PipelineStepper

**Props**: `{ currentPhase: string | null; completedPhases?: string[] }`

Stepper horizontal com 4 passos: Download, Transcricao, Analise, Edicao. Cada passo exibe:
- Icone numerico (pendente), checkmark (completo) ou anel colorido (atual)
- Label abaixo do circulo
- Linha conectora entre passos, colorida nos completos

#### PhaseProgress

**Props**: `{ percentage: number; overallPercentage: number; message: string }`

Dois `ProgressBar` empilhados:
1. Progresso geral (tamanho `lg`, sem % inline, com label "Progresso geral")
2. Progresso da fase atual (tamanho `sm`, com %, cor `primary`) + indicador pulsante com mensagem

### Dominio: ui

#### Badge

**Props**: `{ children: ReactNode; variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' }`

Pill colorido para status, contagens e hashtags.

#### Button

**Props**: `{ variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; ...HTMLButtonAttributes }`

Botao com 3 variantes de estilo e 3 tamanhos. Quando `loading = true`, exibe spinner SVG embutido e desabilita interacao.

#### Card

**Props**: `{ children: ReactNode; padding?: 'none' | 'sm' | 'md' | 'lg'; ...HTMLDivAttributes }`

Container com fundo branco, borda cinza, borda arredondada e sombra leve. Padding configuravel (padrao: `md`).

#### ProgressBar

**Props**: `{ percentage: number; label?: string; showPercentage?: boolean; size?: 'sm' | 'md' | 'lg'; color?: 'primary' | 'success' | 'warning' | 'error' }`

Barra de progresso com transicao CSS de 1 segundo (`transition-all duration-1000`). O valor e fixado entre 0 e 100 (`Math.min/max`). Exibe label e/ou percentual conforme props.

#### Spinner

**Props**: `{ size?: 'sm' | 'md' | 'lg' }`

SVG spinner animado em cor `primary-600`. Tamanhos: 16px, 32px, 48px.

---

## Zustand stores

### usePipelineStore

Gerencia o estado do job ativo (em processamento ou recentemente completado). **Nao e persistido** — reinicializa ao recarregar a pagina.

```typescript
interface PipelineState {
  jobId: string | null;
  status: string;           // JobStatus
  currentPhase: string | null;
  phasePercentage: number;
  overallPercentage: number;
  message: string;
  videoMetadata: VideoMetadata | null;
  clips: ClipResult[];
  error: string | null;

  setJobId(id: string): void;
  updateProgress(event: ProgressEvent): void;
  setResult(metadata: VideoMetadata | null, clips: ClipResult[]): void;
  setError(error: string): void;
  reset(): void;
}
```

`updateProgress` traduz o status do evento SSE para o `JobStatus` correspondente: `'failed'` → `FAILED`, `'completed' + overallPercentage >= 100` → `COMPLETED`, demais → `PROCESSING`.

### useJobHistoryStore

Persiste o historico dos ultimos 20 jobs processados no `localStorage` (chave `videoclipper-history`). Usado na `HomePage` para exibir cortes recentes.

```typescript
interface HistoryEntry {
  jobId: string;
  videoUrl: string;
  title: string;
  clipCount: number;
  createdAt: string;
  status: string;
}
```

`addEntry` insere no inicio e fatia para no maximo 20 entradas.

### useToastStore

Gerencia a pilha de notificacoes temporarias. Ver secao Toast acima.

---

## Hooks

### useSSE(jobId)

Gerencia uma conexao `EventSource` com o endpoint SSE. Fecha a conexao automaticamente via cleanup do `useEffect` quando o componente desmonta ou o `jobId` muda.

```typescript
// Retorno
{
  lastEvent: ProgressEvent | null;
  isConnected: boolean;
  error: string | null;
}
```

A conexao e aberta em `createSSEConnection(jobId, onProgress, onError)`, que encapsula o `EventSource` e parseia os eventos JSON.

### usePipelineProgress(jobId)

Composicao de `useSSE` + `usePipelineStore`. Cada evento recebido e repassado para `store.updateProgress`. Retorna uma visao consolidada do estado atual:

```typescript
{
  phase: string | null;
  phasePercentage: number;
  overallPercentage: number;
  message: string;
  status: string;
  error: string | null;
  isConnected: boolean;
}
```

---

## Servicos

### apiClient

Modulo singleton com dois metodos:

```typescript
apiClient.createJob(data: CreateJobRequest): Promise<CreateJobResponse>
// POST /api/jobs

apiClient.getJob(jobId: string): Promise<JobResult>
// GET /api/jobs/:jobId
```

Toda requisicao que retornar HTTP nao-2xx lanca `Error` com a mensagem do campo `message` no corpo da resposta.

### createSSEConnection

```typescript
createSSEConnection(
  jobId: string,
  onProgress: (event: ProgressEvent) => void,
  onError?: (error: Event) => void,
): EventSource
```

Cria um `EventSource` em `/api/jobs/:jobId/progress`. Parseia cada mensagem como `ProgressEvent` e chama `onProgress`. Eventos malformados sao ignorados silenciosamente.

---

## Principio de UX: feedback constante

Todo estado assincrono no frontend tem representacao visual:

| Estado | Componente |
|---|---|
| Submetendo URL | `VideoUrlInput` com spinner + "Processando..." |
| Pipeline em execucao | `PipelineStepper` + `PhaseProgress` (tempo real) |
| Carregando resultados | 4x `SkeletonCard` |
| Erro de API | `useToastStore.add('error', ...)` na `HomePage` |
| Falha no pipeline | `ErrorState` com botao de retry na `ProcessingPage` |
| Erro ao carregar resultados | `ErrorState` na `ResultsPage` |
| Lista de cortes vazia | `EmptyState` com descricao explicativa |

O usuário sempre sabe o que esta acontecendo.
