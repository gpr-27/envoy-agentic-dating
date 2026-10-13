/**
 * GitHub Models provider (free for GitHub accounts) over its OpenAI-compatible
 * inference API. Optional: only used when GITHUB_MODELS_TOKEN is set (a token
 * with the `models:read` permission). Output is zod-validated by the router.
 */
import { classifyHttpError, ProviderError } from "../errors";
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";
import { jsonInstruction } from "./groq";

const URL = "https://models.github.ai/inference/chat/completions";

interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string; code?: string };
  usage?: { total_tokens?: number };
}

/** The GitHub Models provider. */
export const githubProvider: LLMProvider = {
  name: "github",
  isAvailable: () => Boolean(process.env.GITHUB_MODELS_TOKEN?.trim()),
  supportsVision: (model) => /gpt-4o|gpt-4\.1|llama-4/.test(model),

  async generate(req: ProviderRequest): Promise<ProviderResponse> {
    const key = process.env.GITHUB_MODELS_TOKEN?.trim();
    if (!key) throw new ProviderError("auth", "GITHUB_MODELS_TOKEN missing");
    const userContent =
      req.images.length && githubProvider.supportsVision(req.model)
        ? [
            { type: "text", text: req.user },
            ...req.images.map((url) => ({ type: "image_url", image_url: { url } })),
          ]
        : req.user;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: "system", content: req.system + jsonInstruction(req.schemaHint) },
        { role: "user", content: userContent },
      ],
      temperature: req.temperature,
      max_tokens: req.maxOutputTokens,
      // JSON mode is reliable on OpenAI models; others rely on the shape in the prompt.
      ...(/^openai\//.test(req.model) ? { response_format: { type: "json_object" } } : {}),
    };

    let res: Response;
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      if ((e as Error)?.name === "AbortError" || /abort/i.test(msg)) throw new ProviderError("timeout", msg);
      throw new ProviderError("server", `network: ${msg}`);
    }
    const raw = await res.text();
    let json: ChatResponse = {};
    try {
      json = JSON.parse(raw) as ChatResponse;
    } catch {
      /* non-JSON error body */
    }
    if (!res.ok) {
      throw classifyHttpError(res.status, json.error?.message ?? raw, res.headers.get("retry-after"));
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("other", `empty response (finish: ${json.choices?.[0]?.finish_reason ?? "unknown"})`);
    return { text, totalTokens: json.usage?.total_tokens };
  },
};
