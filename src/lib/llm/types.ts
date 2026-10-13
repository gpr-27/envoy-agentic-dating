import type { LLMTask } from "@/lib/contracts";

/** Providers the router knows about. */
export type ProviderName = "gemini" | "gemini2" | "groq" | "groq2" | "github" | "mock";

/** One entry of a model chain, e.g. `gemini:gemini-2.5-flash`. */
export interface ModelSpec {
  provider: ProviderName;
  model: string;
}

/** What the router hands to a provider for one call. */
export interface ProviderRequest {
  task: LLMTask;
  model: string;
  system: string;
  user: string;
  /** data: URLs; only passed when the provider supports vision for this model. */
  images: string[];
  /** Simplified JSON schema (Gemini structured output). */
  jsonSchema?: object;
  /** Compact TypeScript-like shape of the expected JSON (for prompt-only providers). */
  schemaHint: string;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface ProviderResponse {
  /** Raw model text (expected to be JSON, maybe fenced). */
  text: string;
  /** Optional rate-limit info (headers) for diagnostics and TPM reconciliation. */
  rateLimit?: Record<string, string>;
  /** Total tokens billed for the call, when the provider reports it. */
  totalTokens?: number;
}

/** A model provider. Implementations throw `ProviderError` on failure. */
export interface LLMProvider {
  readonly name: ProviderName;
  /** False when no API key is configured (the router skips it). */
  isAvailable(): boolean;
  supportsVision(model: string): boolean;
  generate(req: ProviderRequest): Promise<ProviderResponse>;
}
