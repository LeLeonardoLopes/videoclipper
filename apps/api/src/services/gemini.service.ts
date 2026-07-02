import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiAnalysisRequest, GeminiAnalysisResponse, SuggestedClip } from '@videoclipper/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { GeminiAnalysisError } from '../errors/gemini.error.js';
import { GEMINI_TIMEOUT_MS, CLIP_MIN_DURATION_SECONDS, CLIP_MAX_DURATION_SECONDS } from '../config/constants.js';

export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly models: string[];

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    this.models = [env.GEMINI_MODEL, env.GEMINI_FALLBACK_MODEL].filter(Boolean);
  }

  async analyze(request: GeminiAnalysisRequest): Promise<GeminiAnalysisResponse> {
    logger.info({ title: request.videoTitle }, 'Starting virality analysis');

    for (let i = 0; i < this.models.length; i++) {
      const modelName = this.models[i]!;
      try {
        return await withRetry(
          () => this.sendToGemini(request, modelName, request.videoDurationSeconds),
          `gemini-analysis-${modelName}`,
          { maxAttempts: 2, baseDelayMs: 3000 },
        );
      } catch (error) {
        const isServiceError = String(error).includes('503') || String(error).includes('429') || String(error).includes('overloaded');
        const hasNextModel = i < this.models.length - 1;

        if (isServiceError && hasNextModel) {
          logger.warn({ model: modelName, fallback: this.models[i + 1] }, 'Model unavailable, trying fallback');
          continue;
        }
        throw error;
      }
    }

    throw new GeminiAnalysisError('All models failed', { videoTitle: request.videoTitle });
  }

  private async sendToGemini(request: GeminiAnalysisRequest, modelName: string, videoDurationSeconds: number): Promise<GeminiAnalysisResponse> {
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    });

    const prompt = this.buildPrompt(request);

    try {
      const result = await model.generateContent(prompt, { timeout: GEMINI_TIMEOUT_MS });
      const text = result.response.text();
      const parsed = JSON.parse(text) as { suggestedClips: SuggestedClip[]; overallAnalysis: string };

      // Validate and filter clips
      const validClips = (parsed.suggestedClips ?? []).filter((clip) => {
        const duration = clip.endSeconds - clip.startSeconds;
        if (clip.startSeconds < 0 || clip.endSeconds <= clip.startSeconds) {
          logger.warn({ clip }, 'Clip rejected: invalid timestamps');
          return false;
        }
        if (clip.endSeconds > videoDurationSeconds) {
          logger.warn({ clip }, 'Clip rejected: exceeds video duration');
          return false;
        }
        if (duration < CLIP_MIN_DURATION_SECONDS || duration > CLIP_MAX_DURATION_SECONDS) {
          logger.warn({ clip, duration }, `Clip rejected: duration ${duration}s outside ${CLIP_MIN_DURATION_SECONDS}-${CLIP_MAX_DURATION_SECONDS}s range`);
          return false;
        }
        return true;
      });

      logger.info({ model: modelName, total: parsed.suggestedClips?.length ?? 0, valid: validClips.length }, 'Analysis completed');

      return {
        suggestedClips: validClips,
        overallAnalysis: parsed.overallAnalysis ?? '',
      };
    } catch (error) {
      throw new GeminiAnalysisError(`Analysis failed with ${modelName}: ${String(error)}`, {
        videoTitle: request.videoTitle,
        model: modelName,
      });
    }
  }

  private buildPrompt(request: GeminiAnalysisRequest): string {
    const transcriptionText = request.transcription.segments
      .map((s) => `[${this.formatTime(s.start)} - ${this.formatTime(s.end)}] ${s.text}`)
      .join('\n');

    return `Você é um especialista em conteúdo viral para redes sociais (TikTok, Reels, Shorts).

Analise a transcrição abaixo de um vídeo do YouTube e identifique os melhores momentos para cortes virais.

## Dados do Vídeo
- Título: ${request.videoTitle}
- Canal: ${request.channelName}
- Duração: ${this.formatTime(request.videoDurationSeconds)}

## Transcrição com Timestamps
${transcriptionText}

## Instruções
Identifique de 3 a 8 cortes virais (30-90 segundos cada) que contenham:
1. **Gancho forte** nos primeiros 3 segundos (frase impactante, pergunta, revelação)
2. **Desenvolvimento** com informação valiosa ou entretenimento
3. **Conclusão** satisfatória ou cliffhanger

Para cada corte, retorne um JSON com este schema:
{
  "suggestedClips": [
    {
      "startSeconds": number,
      "endSeconds": number,
      "seoTitle": "Título otimizado para SEO (max 100 chars)",
      "description": "Legenda para redes sociais (max 300 chars)",
      "hashtags": ["hashtag1", "hashtag2", ...],
      "whyChosen": "Motivo técnico da escolha deste trecho",
      "hookText": "O texto exato do gancho inicial",
      "keywords": ["palavra-chave1", "palavra-chave2"]
    }
  ],
  "overallAnalysis": "Análise geral do potencial viral do vídeo"
}

IMPORTANTE: Os timestamps devem ser PRECISOS e corresponder à transcrição. Retorne APENAS o JSON, sem markdown.`;
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
}
