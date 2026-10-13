/**
 * Thin, injectable wrapper over `apify-client`: start an actor run, read run
 * status, list dataset items. Tests inject a fake via {@link setApifyClientFactory}.
 * Also defines the scrape error types and Apify quota detection.
 */
import { ApifyClient } from "apify-client";
import { scrapeConfig } from "./config";
import { asObj, str } from "./util";

/** Raised when Apify reports exhausted credit / usage limits. Not retryable until reset. */
export class ApifyQuotaError extends Error {
  readonly code = "quota_exhausted" as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ApifyQuotaError";
  }
}

/** Raised when scraping is not configured (APIFY_TOKEN missing outside mock mode). */
export class ScrapeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScrapeConfigError";
  }
}

/** Apify run status values (see ACTOR_JOB_STATUSES). */
export type RunStatus = "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMING-OUT" | "TIMED-OUT" | "ABORTING" | "ABORTED";

/** The subset of an Apify run object we use. */
export type RunInfo = { id: string; status: RunStatus | string; defaultDatasetId: string; statusMessage?: string | null };

/** Options for starting a run (subset of apify-client ActorStartOptions). */
export type StartOptions = { memory?: number; timeout?: number; maxItems?: number; maxTotalChargeUsd?: number };

/** Minimal client surface the scraper needs; implement this to fake Apify in tests. */
export interface ApifyLike {
  startActor(actorId: string, input: Record<string, unknown>, options: StartOptions): Promise<RunInfo>;
  getRun(runId: string): Promise<RunInfo | null>;
  listItems(datasetId: string, options?: { limit?: number }): Promise<unknown[]>;
}

type Factory = () => ApifyLike;
let factory: Factory | null = null;

/** Injects a custom client factory (tests). Pass `null` to restore the real client. */
export function setApifyClientFactory(f: Factory | null): void {
  factory = f;
}

/** Wraps the real `apify-client` behind {@link ApifyLike}. */
export function realApifyClient(token: string): ApifyLike {
  const client = new ApifyClient({ token, maxRetries: 2, minDelayBetweenRetriesMillis: 500 });
  return {
    async startActor(actorId, input, options) {
      const run = await client.actor(actorId).start(input, options);
      return { id: run.id, status: run.status, defaultDatasetId: run.defaultDatasetId, statusMessage: run.statusMessage ?? null };
    },
    async getRun(runId) {
      const run = await client.run(runId).get();
      return run ? { id: run.id, status: run.status, defaultDatasetId: run.defaultDatasetId, statusMessage: run.statusMessage ?? null } : null;
    },
    async listItems(datasetId, options) {
      const page = await client.dataset(datasetId).listItems({ clean: true, limit: options?.limit ?? 1000 });
      return page.items;
    },
  };
}

/** Returns the active client (injected or real). Throws {@link ScrapeConfigError} without a token. */
export function getApifyClient(): ApifyLike {
  if (factory) return factory();
  const { token } = scrapeConfig();
  if (!token) throw new ScrapeConfigError("APIFY_TOKEN is not set. Add it to .env.local, or set MOCK_EXTERNALS=1 for synthetic data.");
  return realApifyClient(token);
}

/** Terminal run states. */
export function isTerminal(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"].includes(status);
}

const QUOTA_TEXT_RE = /usage|credit|limit|quota|insufficient|not.enough|exceeded|platform.feature.disabled|payment|upgrade/i;
const NOT_QUOTA_RE = /memory|concurren|rate.?limit|too many requests/i;

/**
 * Classifies an error (from apify-client or a run status message) as an
 * Apify quota/credit problem: HTTP 402, or 403 mentioning limit/credit/usage,
 * or `platform-feature-disabled`. Memory/concurrency limits are transient and excluded.
 */
export function isQuotaError(e: unknown): boolean {
  const o = asObj(e);
  const status = typeof o.statusCode === "number" ? o.statusCode : typeof o.status === "number" ? o.status : 0;
  const type = str(o.type);
  const text = `${type} ${e instanceof Error ? e.message : str(o.message)}`;
  if (/platform-feature-disabled|not-enough-usage|usage-limit|monthly-usage|credit/i.test(type)) return true;
  if (NOT_QUOTA_RE.test(text)) return false;
  if (/platform-feature-disabled|not-enough-usage|usage-limit|monthly usage/i.test(text)) return true;
  if (status === 402) return true;
  if (status === 403 && /limit|credit|usage/i.test(text)) return true;
  return false;
}

/** Whether a failed run's status message indicates exhausted credit. */
export function isQuotaRunMessage(message: string | null | undefined): boolean {
  const m = message ?? "";
  return !NOT_QUOTA_RE.test(m) && QUOTA_TEXT_RE.test(m) && /usage|credit|quota|payment|plan/i.test(m);
}

/** Re-throws quota errors as {@link ApifyQuotaError}; other errors unchanged. */
export function rethrowQuota(e: unknown, context: string): never {
  if (e instanceof ApifyQuotaError || e instanceof ScrapeConfigError) throw e;
  if (isQuotaError(e)) {
    throw new ApifyQuotaError(`Apify free-plan credit/usage limit reached while ${context}. Retry after the monthly reset.`, { cause: e });
  }
  throw e;
}

/** Human-readable error message. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
