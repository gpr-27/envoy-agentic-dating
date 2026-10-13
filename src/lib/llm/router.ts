/**
 * LLM router: one `complete()` call → ordered model chain per task class,
 * per-model RPM token buckets, daily (RPD) soft caps, backoff with jitter,
 * one JSON repair attempt per model, zod validation of every output.
 */
import type { z } from "zod";
import type { LLMTask } from "@/lib/contracts";
import { getClock, secondsUntilUtcMidnight } from "./clock";
import { chainForTask, rpdFor, specId, timeoutMs, tpdFor } from "./config";
import { LLMError, ProviderError, QuotaExhaustedError } from "./errors";
import { parseJsonLoose, validateWithCoercion } from "./json";
import { shapeHint, toProviderJsonSchema } from "./jsonschema";
import { bucketFor, estimateTokens, tokenBucketFor } from "./limiter";
import { gemini2Provider, geminiProvider } from "./providers/gemini";
import { githubProvider } from "./providers/github";
import { groq2Provider, groqProvider } from "./providers/groq";
import { mockProvider } from "./mock";
import type { LLMProvider, ModelSpec, ProviderName, ProviderRequest } from "./types";
import { getUsageCounter, tokenKey, usageKey } from "./usage";

/** Arguments for one structured completion. */
export interface CompleteArgs<T> {
  task: LLMTask;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Optional hand-written simplified JSON schema; derived from `schema` otherwise. */
  jsonSchema?: object;
  /** data: URLs, sent only to vision-capable models. */
  images?: string[];
  temperature?: number;
  maxOutputTokens?: number;
}

/** Result of a structured completion. */
export interface CompleteResult<T> {
  data: T;
  /** Model id that produced `data`, e.g. "gemini-2.5-flash". */
  model: string;
  provider: ProviderName;
}

/** Tunables (tests shrink the backoff). */
export interface RouterOptions {
  /** Retries on the same model for 429 (per-minute). */
  maxRetriesRateLimit: number;
  /** Retries on the same model for 5xx / 503 "high demand" / timeouts. */
  maxRetriesServer: number;
  backoffBaseMs: number;
  /** If a provider asks us to wait longer than this, move to the next model instead. */
  maxWaitMs: number;
}

const DEFAULT_OPTIONS: RouterOptions = { maxRetriesRateLimit: 2, maxRetriesServer: 1, backoffBaseMs: 1000, maxWaitMs: 20_000 };
let options: RouterOptions = { ...DEFAULT_OPTIONS };

/** Override router tunables (tests). Pass nothing to reset. */
export function setRouterOptions(o?: Partial<RouterOptions>): void {
  options = { ...DEFAULT_OPTIONS, ...(o ?? {}) };
}

const BUILTIN: Record<ProviderName, LLMProvider> = {
  gemini: geminiProvider,
  gemini2: gemini2Provider,
  groq: groqProvider,
  groq2: groq2Provider,
  github: githubProvider,
  mock: mockProvider,
};
let providers: Record<ProviderName, LLMProvider> = { ...BUILTIN };

/** Replace one provider implementation (tests: fake/recording providers). */
export function setProvider(name: ProviderName, provider: LLMProvider): void {
  providers[name] = provider;
}

/** Restore the built-in providers. */
export function resetProviders(): void {
  providers = { ...BUILTIN };
}

/** Provider implementation for a name. */
export function getProvider(name: ProviderName): LLMProvider {
  return providers[name];
}

const DEFAULT_MAX_TOKENS: Record<LLMTask, number> = {
  read: 2500,
  synthesize: 4500,
  plan: 700,
  turn: 300,
  debrief: 600,
  compact_date: 2800,
};
const DEFAULT_TEMPERATURE: Record<LLMTask, number> = {
  read: 0.4,
  synthesize: 0.3,
  plan: 0.8,
  turn: 0.9,
  debrief: 0.5,
  compact_date: 0.85,
};

function debug(msg: string): void {
  if (process.env.LLM_DEBUG === "1") console.log(`[llm] ${msg}`);
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ms = timeoutMs();
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new ProviderError("timeout", `timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([fn(ctrl.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function backoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined) return retryAfterSec * 1000 + Math.random() * 250;
  return options.backoffBaseMs * 2 ** attempt + Math.random() * options.backoffBaseMs * 0.5;
}

function buildRepairPrompt(user: string, badOutput: string, error: string, hint: string): string {
  return `${user}\n\n---\nYour previous reply could not be used.\nProblem: ${error}\nPrevious reply (truncated):\n${badOutput.slice(0, 1500)}\n\nReturn the corrected answer as ONE valid JSON object of this shape, nothing else:\n${hint}`;
}

/**
 * One structured completion with fallback across the task's model chain.
 * @throws QuotaExhaustedError when every model is rate/quota limited.
 * @throws LLMError for any other total failure.
 */
/** Tasks with many small calls: spread them across the models that can serve soonest. */
const SPREAD_TASKS = new Set(["read", "synthesize", "plan", "turn", "debrief", "compact_date"]);

/**
 * Stable reorder of a chain so the model whose RPM/TPM buckets can serve this
 * call soonest goes first. Free tiers are per-model, so rotating many small
 * calls across models multiplies throughput instead of queueing on one.
 */
function spreadChain(chain: ModelSpec[], est: number): ModelSpec[] {
  const wait = (s: ModelSpec) => Math.max(bucketFor(s).waitMs(1), tokenBucketFor(s).waitMs(est));
  return chain
    .map((spec, i) => ({ spec, i, w: wait(spec) }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .map((x) => x.spec);
}

export async function complete<T>(args: CompleteArgs<T>): Promise<CompleteResult<T>> {
  const baseChain = chainForTask(args.task);
  const chain =
    SPREAD_TASKS.has(args.task) && process.env.LLM_SPREAD !== "0"
      ? spreadChain(
          baseChain,
          estimateTokens(args.system, args.user, args.maxOutputTokens ?? DEFAULT_MAX_TOKENS[args.task]),
        )
      : baseChain;
  const jsonSchema = args.jsonSchema ?? toProviderJsonSchema(args.schema);
  const hint = shapeHint(jsonSchema);
  const usage = getUsageCounter();
  const attempts: string[] = [];
  let quotaBlocked = 0;
  let consideredModels = 0;
  let minRetryAfter = Number.POSITIVE_INFINITY;

  for (const spec of chain) {
    const provider = providers[spec.provider];
    if (!provider || !provider.isAvailable()) {
      attempts.push(`${specId(spec)} → skipped (no key)`);
      continue;
    }
    consideredModels++;
    const key = usageKey(spec);
    const est = estimateTokens(args.system, args.user, args.maxOutputTokens ?? DEFAULT_MAX_TOKENS[args.task]);
    const dayBudgetUsed = (await usage.get(key)) >= rpdFor(spec) || (await usage.get(tokenKey(spec))) + est > tpdFor(spec);
    if (dayBudgetUsed) {
      attempts.push(`${specId(spec)} → skipped (daily request/token budget used)`);
      quotaBlocked++;
      minRetryAfter = Math.min(minRetryAfter, secondsUntilUtcMidnight());
      continue;
    }

    const outcome = await tryModel(spec, provider, args, jsonSchema, hint, attempts);
    if (outcome.ok) return { data: outcome.data, model: spec.model, provider: spec.provider };
    if (outcome.quota) {
      quotaBlocked++;
      minRetryAfter = Math.min(minRetryAfter, outcome.retryAfterSec);
      if (outcome.day) await markDayExhausted(spec);
    }
  }

  if (consideredModels === 0) {
    throw new LLMError(`No LLM provider configured for task "${args.task}" (set GEMINI_API_KEY / GROQ_API_KEY or MOCK_EXTERNALS=1)`, attempts);
  }
  if (quotaBlocked === consideredModels) {
    const retry = Number.isFinite(minRetryAfter) ? Math.ceil(minRetryAfter) : 60;
    throw new QuotaExhaustedError(`All models for task "${args.task}" are out of free-tier quota`, retry, attempts);
  }
  throw new LLMError(`All models failed for task "${args.task}": ${attempts.slice(-3).join(" | ")}`, attempts);
}

/** Mark a model as used up for today (after a "per day" 429). */
async function markDayExhausted(spec: ModelSpec): Promise<void> {
  const usage = getUsageCounter();
  const key = usageKey(spec);
  const cap = rpdFor(spec);
  if (Number.isFinite(cap)) await usage.incr(key, Math.max(0, cap - (await usage.get(key))));
  const tcap = tpdFor(spec);
  if (Number.isFinite(tcap)) await usage.incr(tokenKey(spec), Math.max(0, tcap - (await usage.get(tokenKey(spec)))));
}

/** Reconcile TPM/TPD accounting with what the provider reported. */
async function recordTokens(spec: ModelSpec, estimate: number, totalTokens: number | undefined, rateLimit?: Record<string, string>): Promise<void> {
  const actual = totalTokens ?? estimate;
  const bucket = tokenBucketFor(spec);
  bucket.adjust(actual - estimate);
  const remaining = Number(rateLimit?.["x-ratelimit-remaining-tokens"]);
  if (rateLimit?.["x-ratelimit-remaining-tokens"] !== undefined && Number.isFinite(remaining)) bucket.clampTo(remaining);
  await getUsageCounter().incr(tokenKey(spec), actual);
}

type ModelOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; quota: true; day: boolean; retryAfterSec: number }
  | { ok: false; quota: false };

async function tryModel<T>(
  spec: ModelSpec,
  provider: LLMProvider,
  args: CompleteArgs<T>,
  jsonSchema: object,
  hint: string,
  attempts: string[],
): Promise<ModelOutcome<T>> {
  const id = specId(spec);
  const usage = getUsageCounter();
  const images = provider.supportsVision(spec.model) ? (args.images ?? []) : [];
  let user = args.user;
  let repaired = false;
  let retries = 0;

  for (;;) {
    const maxOutputTokens = args.maxOutputTokens ?? DEFAULT_MAX_TOKENS[args.task];
    const estimate = estimateTokens(args.system, user, maxOutputTokens, images.length);
    await bucketFor(spec).acquire();
    await tokenBucketFor(spec).acquire(estimate);
    await usage.incr(usageKey(spec));
    const started = getClock().now();
    const req: Omit<ProviderRequest, "signal"> = {
      task: args.task,
      model: spec.model,
      system: args.system,
      user,
      images,
      jsonSchema,
      schemaHint: hint,
      temperature: args.temperature ?? DEFAULT_TEMPERATURE[args.task],
      maxOutputTokens,
    };

    let text: string;
    try {
      const res = await withTimeout((signal) => provider.generate({ ...req, signal }));
      text = res.text;
      await recordTokens(spec, estimate, res.totalTokens, res.rateLimit);
    } catch (e) {
      const pe = e instanceof ProviderError ? e : new ProviderError("other", (e as Error)?.message ?? String(e));
      attempts.push(`${id} → ${pe.kind}${pe.status ? ` (${pe.status})` : ""}: ${pe.message.slice(0, 120)}`);
      debug(attempts[attempts.length - 1]);
      if (pe.kind === "quota_day") return { ok: false, quota: true, day: true, retryAfterSec: secondsUntilUtcMidnight() };
      const maxRetries = pe.kind === "rate_limit" ? options.maxRetriesRateLimit : options.maxRetriesServer;
      if (pe.retryable && retries < maxRetries) {
        const wait = backoffMs(retries, pe.retryAfterSec);
        if (wait <= options.maxWaitMs) {
          retries++;
          await getClock().sleep(wait);
          continue;
        }
      }
      if (pe.kind === "rate_limit") return { ok: false, quota: true, day: false, retryAfterSec: pe.retryAfterSec ?? 60 };
      return { ok: false, quota: false };
    }

    let parsed: unknown;
    let error: string;
    try {
      parsed = parseJsonLoose(text);
      const v = validateWithCoercion(args.schema, parsed);
      if (v.ok) {
        debug(`${id} ok in ${getClock().now() - started}ms`);
        return { ok: true, data: v.data };
      }
      error = `schema validation failed: ${v.error}`;
    } catch (e) {
      error = `invalid JSON: ${(e as Error).message}`;
    }
    attempts.push(`${id} → ${error.slice(0, 160)}`);
    debug(attempts[attempts.length - 1]);
    if (repaired) return { ok: false, quota: false };
    repaired = true;
    user = buildRepairPrompt(args.user, text, error, hint);
  }
}
