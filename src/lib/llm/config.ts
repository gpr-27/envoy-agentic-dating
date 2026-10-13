/**
 * Router configuration: model chains per task class and per-provider limits.
 * Everything is read from env at call time so tests (and ops) can change it.
 */
import type { LLMTask } from "@/lib/contracts";
import type { ModelSpec, ProviderName } from "./types";

/** Task classes, each with its own ordered fallback chain. */
export type ChainName = "analysis" | "date" | "debrief";

/** Which chain serves which task. */
export const TASK_CHAIN: Record<LLMTask, ChainName> = {
  read: "analysis",
  synthesize: "analysis",
  plan: "date",
  turn: "date",
  compact_date: "date",
  debrief: "debrief",
};

/** Default chains (free tiers only). Override with LLM_CHAIN_<NAME>. */
export const DEFAULT_CHAINS: Record<ChainName, string> = {
  analysis: "gemini:gemini-3.5-flash,gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b",
  date: "gemini:gemini-2.5-flash-lite,groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-20b,gemini:gemini-2.5-flash",
  debrief: "gemini:gemini-2.5-flash-lite,groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b,gemini:gemini-2.5-flash",
};

const INF = Number.POSITIVE_INFINITY;
const DEFAULT_RPM: Record<ProviderName, number> = { gemini: 9, gemini2: 9, groq: 28, groq2: 28, github: 14, mock: 100_000 };
const DEFAULT_RPD: Record<ProviderName, number> = { gemini: 240, gemini2: 240, groq: 950, groq2: 950, github: 140, mock: INF };
/** Groq free tier is token-bound (8K TPM / 200K TPD per model); Gemini limits are request-bound/unknown. */
const DEFAULT_TPM: Record<ProviderName, number> = { gemini: INF, gemini2: INF, groq: 7500, groq2: 7500, github: INF, mock: INF };
const DEFAULT_TPD: Record<ProviderName, number> = { gemini: INF, gemini2: INF, groq: 190_000, groq2: 190_000, github: INF, mock: INF };

/** The only model used in offline mock mode. */
export const MOCK_SPEC: ModelSpec = { provider: "mock", model: "mock-1" };

/** True when MOCK_EXTERNALS=1 (deterministic offline provider only). */
export function isMockMode(): boolean {
  return process.env.MOCK_EXTERNALS === "1";
}

/** Parse "gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile". Unknown providers are dropped. */
export function parseChain(spec: string): ModelSpec[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      const provider = (i > 0 ? s.slice(0, i) : "").trim().toLowerCase();
      const model = (i > 0 ? s.slice(i + 1) : s).trim();
      return { provider, model };
    })
    .filter((m): m is ModelSpec => ["gemini", "gemini2", "groq", "groq2", "github", "mock"].includes(m.provider) && m.model.length > 0);
}

/** Ordered model chain for a chain name (mock-only in mock mode). */
export function getChain(name: ChainName): ModelSpec[] {
  if (isMockMode()) return [MOCK_SPEC];
  const env = process.env[`LLM_CHAIN_${name.toUpperCase()}`];
  const parsed = parseChain(env && env.trim() ? env : DEFAULT_CHAINS[name]);
  return parsed.length ? parsed : parseChain(DEFAULT_CHAINS[name]);
}

/** Chain for a task. */
export function chainForTask(task: LLMTask): ModelSpec[] {
  return getChain(TASK_CHAIN[task]);
}

function envNumber(key: string): number | undefined {
  const v = process.env[key];
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function modelSlug(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Requests per minute for a model: LLM_RPM_<PROVIDER>_<MODEL> > LLM_RPM_<PROVIDER> > default. */
export function rpmFor(spec: ModelSpec): number {
  const p = spec.provider.toUpperCase();
  return envNumber(`LLM_RPM_${p}_${modelSlug(spec.model)}`) ?? envNumber(`LLM_RPM_${p}`) ?? DEFAULT_RPM[spec.provider];
}

/** Soft daily request cap: LLM_RPD_<PROVIDER>_<MODEL> > LLM_RPD_<PROVIDER> > default. */
export function rpdFor(spec: ModelSpec): number {
  const p = spec.provider.toUpperCase();
  return envNumber(`LLM_RPD_${p}_${modelSlug(spec.model)}`) ?? envNumber(`LLM_RPD_${p}`) ?? DEFAULT_RPD[spec.provider];
}

/** Tokens per minute: LLM_TPM_<PROVIDER>_<MODEL> > LLM_TPM_<PROVIDER> > default (Infinity = unlimited). */
export function tpmFor(spec: ModelSpec): number {
  const p = spec.provider.toUpperCase();
  return envNumber(`LLM_TPM_${p}_${modelSlug(spec.model)}`) ?? envNumber(`LLM_TPM_${p}`) ?? DEFAULT_TPM[spec.provider];
}

/** Tokens per day soft cap: LLM_TPD_<PROVIDER>_<MODEL> > LLM_TPD_<PROVIDER> > default. */
export function tpdFor(spec: ModelSpec): number {
  const p = spec.provider.toUpperCase();
  return envNumber(`LLM_TPD_${p}_${modelSlug(spec.model)}`) ?? envNumber(`LLM_TPD_${p}`) ?? DEFAULT_TPD[spec.provider];
}

/** Per-call timeout in ms (LLM_TIMEOUT_MS, default 60s). */
export function timeoutMs(): number {
  return envNumber("LLM_TIMEOUT_MS") ?? 60_000;
}

/** "gemini:gemini-2.5-flash" */
export function specId(spec: ModelSpec): string {
  return `${spec.provider}:${spec.model}`;
}
