/**
 * Groq provider (free tier) over the OpenAI-compatible REST API with plain
 * fetch. JSON mode (`response_format: json_object`) + the expected shape in
 * the system prompt; output is zod-validated by the router.
 */
import { classifyHttpError, ProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";

const URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string; code?: string; failed_generation?: string };
  usage?: { total_tokens?: number };
}

/** Rate-limit headers worth surfacing (smoke script / diagnostics). */
function rateHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (k.startsWith("x-ratelimit") || k === "retry-after") out[k] = v;
  });
  return out;
}

/** Instruction appended to the system prompt so JSON mode knows the shape. */
export function jsonInstruction(schemaHint: string): string {
  return `\n\nRespond with ONE JSON object only (no prose, no code fences) matching this TypeScript shape exactly:\n${schemaHint}`;
}

/** A Groq provider for one account (key in `keyEnv`). */
function makeGroqProvider(name: "groq" | "groq2", keyEnv: string): LLMProvider {
  return {
    name,
    isAvailable: () => Boolean(process.env[keyEnv]?.trim()),
    supportsVision: (model) => /llama-4|vision/.test(model),

    async generate(req: ProviderRequest): Promise<ProviderResponse> {
      const key = process.env[keyEnv]?.trim();
      if (!key) throw new ProviderError("auth", `${keyEnv} missing`);
      const reasoning = /gpt-oss/.test(req.model);
      const qwen = /qwen/.test(req.model);
      const body: Record<string, unknown> = {
        model: req.model,
        messages: [
          {
            role: "system",
            content: req.system + jsonInstruction(req.schemaHint),
          },
          { role: "user", content: req.user },
        ],
        temperature: req.temperature,
        // Reasoning models spend tokens before the answer; give them headroom.
        max_completion_tokens:
          req.maxOutputTokens + (reasoning || qwen ? 1024 : 0),
        response_format: { type: "json_object" },
        ...(reasoning ? { reasoning_effort: "low" } : {}),
        ...(qwen ? { reasoning_format: "hidden" } : {}),
      };

      let res: Response;
      try {
        res = await fetch(URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: req.signal,
        });
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        if ((e as Error)?.name === "AbortError" || /abort/i.test(msg))
          throw new ProviderError("timeout", msg);
        throw new ProviderError("server", `network: ${msg}`);
      }
      const rateLimit = rateHeaders(res.headers);
      const raw = await res.text();
      let json: GroqResponse = {};
      try {
        json = JSON.parse(raw) as GroqResponse;
      } catch {
        /* non-JSON error body */
      }
      if (!res.ok) {
        // JSON mode failed validation server-side: hand the text back so the router can repair it.
        if (res.status === 400 && json.error?.code === "json_validate_failed") {
          return { text: json.error.failed_generation ?? "", rateLimit };
        }
        throw classifyHttpError(
          res.status,
          json.error?.message ?? raw,
          res.headers.get("retry-after"),
        );
      }
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text.trim())
        throw new ProviderError(
          "other",
          `empty response (finish: ${json.choices?.[0]?.finish_reason ?? "unknown"})`,
        );
      return { text, rateLimit, totalTokens: json.usage?.total_tokens };
    },
  };
}

/** Account 1 and account 2 (separate free quotas). */
export const groqProvider = makeGroqProvider("groq", "GROQ_API_KEY");
export const groq2Provider = makeGroqProvider("groq2", "GROQ_API_KEY_2");
