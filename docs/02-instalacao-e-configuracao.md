# Instalacao e Configuracao — VideoClipper v2

## Pre-requisitos

### Runtime e gerenciador de pacotes

| Ferramenta | Versao minima | Como verificar |
|---|---|---|
| Node.js | 20.0.0 | `node --version` |
| pnpm | 9.15.0 | `pnpm --version` |

Para instalar o pnpm:

```bash
npm install -g pnpm@9.15.0
```

### Ferramentas de sistema

As tres ferramentas abaixo precisam estar disponiveis no PATH do sistema operacional.

#### FFmpeg

Necessario para corte de video, crop 9:16, queima de legendas e normalizacao de audio.

```bash
# Ubuntu / Debian
sudo apt install ffmpeg

# macOS (Homebrew)
brew install ffmpeg

# Windows — baixar o binario de https://ffmpeg.org/download.html
# e adicionar ao PATH do sistema
```

Verificar:
```bash
ffmpeg -version
```

#### yt-dlp

Necessario para download do .mp4 completo do YouTube.

```bash
# Ubuntu / Debian / macOS
pip install yt-dlp
# ou
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# Windows — baixar o .exe de https://github.com/yt-dlp/yt-dlp/releases
# e adicionar ao PATH
```

Verificar:
```bash
yt-dlp --version
```

#### whisper.cpp (servidor)

O sistema de transcricao requer o `whisper-server` do projeto whisper.cpp. O VideoClipper v2 pode tanto iniciar o servidor automaticamente (via `WHISPER_SERVER_PATH`) quanto assumir que ele ja esta em execucao (modo manual, configuracao padrao).

**Modo manual (padrao e recomendado em desenvolvimento):**

Inicie o servidor antes de rodar a API:

```bash
# Exemplo — ajuste os caminhos conforme sua instalacao
./whisper-server -m ./models/ggml-base.bin --port 9000 -l pt
```

O servidor deve estar respondendo em `http://localhost:9000` antes de processar qualquer video.

**Modo automatico (opcional):**

Configure as variaveis `WHISPER_SERVER_PATH` e `WHISPER_MODEL_PATH` no `.env`. A API inicializara o servidor ao subir e o desligara ao encerrar.

### Chave de API do Gemini

Obtenha uma chave em [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) e a defina como `GEMINI_API_KEY` no arquivo `.env`.

---

## Variaveis de ambiente

Crie um arquivo `.env` na raiz do monorepo (`VideoClipper_v2/.env`). O backend valida todas as variaveis com Zod no startup; variaveis invalidas ou ausentes causam `process.exit(1)` com mensagem de erro.

### Tabela completa de variaveis

| Variavel | Tipo | Padrao | Obrigatoria | Descricao |
|---|---|---|---|---|
| `GEMINI_API_KEY` | string | — | **Sim** | Chave da API Google Gemini. Sem valor padrao — o startup falha sem ela. |
| `WHISPER_API_URL` | URL | `http://localhost:9000` | Nao | URL base do servidor whisper.cpp. |
| `WHISPER_LANGUAGE` | string | `pt` | Nao | Codigo de idioma passado ao Whisper (`-l pt`). |
| `WHISPER_SERVER_PATH` | string | `""` (vazio) | Nao | Caminho para o binario `whisper-server`. Se vazio, o modo manual e assumido. |
| `WHISPER_MODEL_PATH` | string | `""` (vazio) | Nao | Caminho para o arquivo `.bin` do modelo (ex: `ggml-base.bin`). Necessario apenas no modo automatico. |
| `GEMINI_MODEL` | string | `gemini-2.5-flash` | Nao | Modelo principal do Gemini. |
| `GEMINI_FALLBACK_MODEL` | string | `gemini-2.0-flash` | Nao | Modelo de fallback usado quando o principal retorna 503/429. |
| `PORT` | number | `3001` | Nao | Porta em que a API Fastify escuta. |
| `HOST` | string | `0.0.0.0` | Nao | Interface de rede da API. |
| `NODE_ENV` | enum | `development` | Nao | Ambiente (`development`, `production`, `test`). |
| `TEMP_DIR` | string | `<os.tmpdir()>/videoclipper` | Nao | Diretorio para arquivos temporarios (video bruto, audio WAV). |
| `OUTPUT_DIR` | string | `./output` | Nao | Diretorio de saida para os cortes finais. |
| `FFMPEG_CONCURRENCY` | number | `2` | Nao | Numero de cortes processados em paralelo pelo FFmpeg. |
| `FFMPEG_PATH` | string | `ffmpeg` | Nao | Caminho ou nome do binario FFmpeg (util se nao estiver no PATH). |
| `YTDLP_PATH` | string | `yt-dlp` | Nao | Caminho ou nome do binario yt-dlp. |

### Exemplo de arquivo .env

```env
# Obrigatoria
GEMINI_API_KEY=AIza...

# Whisper — modo manual (servidor ja em execucao na porta 9000)
WHISPER_API_URL=http://localhost:9000
WHISPER_LANGUAGE=pt

# Whisper — modo automatico (descomente se quiser que a API gerencie o servidor)
# WHISPER_SERVER_PATH=/home/user/whisper.cpp/whisper-server
# WHISPER_MODEL_PATH=/home/user/whisper.cpp/models/ggml-base.bin

# Diretórios
TEMP_DIR=/tmp/videoclipper
OUTPUT_DIR=./output

# API
PORT=3001
NODE_ENV=development
```

---

## Instalacao

```bash
# Clone o repositorio
git clone <url-do-repositorio>
cd VideoClipper_v2

# Instale todas as dependencias do monorepo
pnpm install

# Construa o pacote shared (necessario antes de rodar api/web)
pnpm turbo build --filter=@videoclipper/shared

# Crie e configure o .env na raiz
cp .env.example .env   # se existir; caso contrario, crie manualmente
```

---

## Comandos de desenvolvimento

```bash
# Iniciar API (porta 3001) e frontend (porta 5173) simultaneamente
pnpm turbo dev

# Iniciar apenas o backend
pnpm turbo dev --filter=@videoclipper/api

# Iniciar apenas o frontend
pnpm turbo dev --filter=@videoclipper/web

# Build de producao de todos os pacotes
pnpm turbo build

# Verificacao de tipos TypeScript em todos os pacotes
pnpm turbo typecheck

# Build do shared isoladamente (necessario apos alterar contratos)
pnpm turbo build --filter=@videoclipper/shared

# Formatacao Prettier em todos os arquivos
pnpm format
```

---

## Configuracao do whisper.cpp (detalhamento)

O VideoClipper v2 se comunica com o whisper.cpp via HTTP na rota `/inference` usando multipart/form-data.

### Parametros enviados em cada requisicao

| Campo do form | Valor |
|---|---|
| `file` | Blob do arquivo `.wav` (PCM 16-bit, 16 kHz mono) |
| `language` | Valor de `WHISPER_LANGUAGE` (padrao: `pt`) |
| `response_format` | `verbose_json` |
| `word_timestamps` | `true` |

### Timeout e retry

- Timeout por requisicao: **300 segundos** (5 minutos)
- Tentativas: **3** com backoff exponencial (base 2000 ms, max 10000 ms)
- O retry e ativado para erros de conexao; erros `TranscriptionError` (resposta HTTP nao-OK) nao sao retentados

### Verificacao de saude

O `WhisperProcessService` consulta `GET /health` antes de disparar o processo automatico. O mesmo endpoint e consultado a cada 1 segundo durante ate 30 segundos para aguardar o servidor ficar pronto.

---

## Verificacao pos-instalacao

Apos configurar tudo, execute:

```bash
pnpm turbo dev
```

Verifique:
1. O backend esta respondendo em `http://localhost:3001/api/health` — deve retornar `{"status":"ok","timestamp":"..."}`
2. O frontend esta acessivel em `http://localhost:5173`
3. O whisper.cpp esta respondendo em `http://localhost:9000/health`

Se o whisper.cpp nao estiver em execucao, a API sobe normalmente mas os jobs falham na fase de Transcricao com `TranscriptionError: Whisper server nao encontrado`.

Para mais detalhes sobre o pipeline de processamento, consulte [Pipeline de Processamento](./04-pipeline-de-processamento.md).
Para as variaveis de ambiente na perspectiva do codigo, consulte `apps/api/src/config/env.ts`.
