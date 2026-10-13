/**
 * Error types for the LLM layer.
 *
 * - `ProviderError`: one failed provider call, classified so the router can
 *   decide between retry, fallback and "quota exhausted".
 * - `LLMError`: the router gave up (non-quota reasons).
 * - `QuotaExhaustedError`: every model in the chain is rate/quota limited;
 *   callers should set `waiting_quota` and retry after `retryAfterSec`.
 */

export type ProviderErrorKind =
  | "rate_limit" // 429 per-minute style; retry soon
  | "quota_day" // daily quota exhausted for this model
  | "server" // 5xx
  | "timeout"
  | "bad_request" // 400 (incl. schema rejected)
  | "auth" // 401/403 or missing key
  | "other";

/** A classified failure from a single provider call. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;
  readonly retryAfterSec?: number;

  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; retryAfterSec?: number } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
  }

  /** Whether retrying the same model after a backoff makes sense. */
  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "server" || this.kind === "timeout";
  }
}

/** The router failed for non-quota reasons (invalid output everywhere, auth, etc.). */
export class LLMError extends Error {
  /** One line per attempt, e.g. "gemini:gemini-2.5-flash → rate_limit (429)". */
  readonly attempts: string[];

  constructor(message: string, attempts: string[] = []) {
    super(message);
    this.name = "LLMError";
    this.attempts = attempts;
  }
}

/** Every model in the chain is out of quota (or rate limited). */
export class QuotaExhaustedError extends LLMError {
  /** Suggested wait before retrying, in seconds. */
  readonly retryAfterSec: number;

  constructor(message: string, retryAfterSec: number, attempts: string[] = []) {
    super(message, attempts);
    this.name = "QuotaExhaustedError";
    this.retryAfterSec = retryAfterSec;
  }
}

const DAY_RE = /per\s*day|PerDay|\bRPD\b|\bTPD\b|daily|limit:\s*0\b/i;
const MINUTE_RE = /per\s*minute|PerMinute|\bRPM\b|\bTPM\b/i;

/** Extract a retry delay (seconds) from a header value or error text. */
export function parseRetryAfter(header?: string | null, text?: string): number | undefined {
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n >= 0) return n;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  if (text) {
    const gemini = text.match(/retry in\s*([\d.]+)\s*s/i) ?? text.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
    if (gemini) return Number(gemini[1]);
    // Groq: "Please try again in 7.66s" / "try again in 1m26.4s" / "2h3m4s"
    const groq = text.match(/try again in\s*(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
    if (groq && (groq[1] || groq[2] || groq[3])) {
      return Number(groq[1] ?? 0) * 3600 + Number(groq[2] ?? 0) * 60 + Number(groq[3] ?? 0);
    }
  }
  return undefined;
}

/**
 * Classify an HTTP failure. A 429 mentioning a daily limit (or a free-tier
 * limit of 0) exhausts the model for the day; other 429s are per-minute.
 */
export function classifyHttpError(status: number | undefined, message: string, retryAfterHeader?: string | null): ProviderError {
  const retryAfterSec = parseRetryAfter(retryAfterHeader, message);
  const short = message.slice(0, 500);
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
    const isDay = DAY_RE.test(message) || (/quota/i.test(message) && !MINUTE_RE.test(message) && !retryAfterSec);
    return new ProviderError(isDay ? "quota_day" : "rate_limit", short, { status: status ?? 429, retryAfterSec });
  }
  if (status !== undefined && status >= 500) return new ProviderError("server", short, { status, retryAfterSec });
  if (status === 401 || status === 403) return new ProviderError("auth", short, { status });
  if (status === 400 || status === 404 || status === 422) return new ProviderError("bad_request", short, { status });
  if (status === 408) return new ProviderError("timeout", short, { status });
  return new ProviderError("other", short, { status });
}
