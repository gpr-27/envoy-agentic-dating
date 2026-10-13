/**
 * Google Gemini provider (free AI Studio key) via `@google/genai`.
 * Uses native structured output (`responseJsonSchema`) and inline images.
 */
import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import { classifyHttpError, ProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";

const clients = new Map<string, GoogleGenAI>();

/** Shared client for the key in `keyEnv` (null if unset). */
export function geminiClient(keyEnv = "GEMINI_API_KEY"): GoogleGenAI | null {
  const key = process.env[keyEnv]?.trim();
  if (!key) return null;
  if (!clients.has(key)) clients.set(key, new GoogleGenAI({ apiKey: key }));
  return clients.get(key)!;
}

/** Parse `data:image/jpeg;base64,...` into an inline-data part. */
export function dataUrlToPart(dataUrl: string): Part | null {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!m) return null;
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

/** Thinking settings: a small budget for analysis on 2.5 Flash, minimal elsewhere. */
function thinkingFor(
  req: ProviderRequest,
): GenerateContentConfig["thinkingConfig"] | undefined {
  const analysis = req.task === "read" || req.task === "synthesize";
  if (/gemini-2\.5-flash-lite/.test(req.model))
    return analysis ? { thinkingBudget: 512 } : { thinkingBudget: 0 };
  if (/gemini-2\.5-flash/.test(req.model))
    return { thinkingBudget: analysis ? 1024 : 0 };
  if (/gemini-[3-9]/.test(req.model))
    return {
      thinkingLevel: analysis ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL,
    };
  return undefined;
}

function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  const err = e as { status?: number; message?: string; name?: string };
  const message = err?.message ?? String(e);
  if (err?.name === "AbortError" || /aborted|abort/i.test(message))
    return new ProviderError("timeout", message);
  return classifyHttpError(
    typeof err?.status === "number" ? err.status : undefined,
    message,
  );
}

/** A Gemini provider for one account (key in `keyEnv`). */
function makeGeminiProvider(
  name: "gemini" | "gemini2",
  keyEnv: string,
): LLMProvider {
  return {
    name,
    isAvailable: () => Boolean(process.env[keyEnv]?.trim()),
    supportsVision: (model) => /gemini/.test(model),

    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const ai = geminiClient(keyEnv);
      if (!ai) throw new ProviderError("auth", `${keyEnv} missing`);
      const parts: Part[] = [];
      for (const img of req.images) {
        const p = dataUrlToPart(img);
        if (p) parts.push(p);
      }
      parts.push({ text: req.user });

      const thinking = thinkingFor(req);
      const thinkingExtra =
        thinking?.thinkingBudget ??
        (thinking?.thinkingLevel === ThinkingLevel.LOW ? 1024 : 0);
      const base: GenerateContentConfig = {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens + thinkingExtra,
        abortSignal: req.signal,
        ...(thinking ? { thinkingConfig: thinking } : {}),
      };

      const call = async (config: GenerateContentConfig) => {
        const res = await ai.models.generateContent({
          model: req.model,
          contents: [{ role: "user", parts }],
          config,
        });
        const text = res.text ?? "";
        if (!text.trim()) {
          const reason =
            res.candidates?.[0]?.finishReason ??
            res.promptFeedback?.blockReason ??
            "unknown";
          throw new ProviderError(
            "other",
            `empty response (finish: ${reason})`,
          );
        }
        return { text, totalTokens: res.usageMetadata?.totalTokenCount };
      };

      try {
        return await call(
          req.jsonSchema
            ? { ...base, responseJsonSchema: req.jsonSchema }
            : base,
        );
      } catch (e) {
        const pe = toProviderError(e);
        // Some models reject parts of a JSON schema: retry once with the shape in the prompt instead.
        if (
          pe.kind === "bad_request" &&
          req.jsonSchema &&
          /schema|json/i.test(pe.message)
        ) {
          try {
            return await call({
              ...base,
              systemInstruction: `${req.system}\n\nReturn ONLY a JSON object of this shape:\n${req.schemaHint}`,
            });
          } catch (e2) {
            throw toProviderError(e2);
          }
        }
        throw pe;
      }
    },
  };
}

/** Account 1 and account 2 (separate free quotas). */
export const geminiProvider = makeGeminiProvider("gemini", "GEMINI_API_KEY");
export const gemini2Provider = makeGeminiProvider(
  "gemini2",
  "GEMINI_API_KEY_2",
);
