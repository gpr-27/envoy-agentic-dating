/**
 * Per-model token buckets: one for requests per minute (RPM) and one for
 * tokens per minute (TPM; Groq's free tier is token-bound). Capacity = the
 * per-minute limit, refilled continuously. Callers await `acquire(n)`, which
 * sleeps instead of letting the provider return 429.
 */
import { getClock } from "./clock";
import { rpmFor, specId, tpmFor } from "./config";
import type { ModelSpec } from "./types";

/** A continuously refilled bucket with `perMinute` capacity. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(readonly perMinute: number) {
    this.tokens = perMinute;
    this.last = getClock().now();
  }

  private refill(): void {
    const now = getClock().now();
    const elapsed = Math.max(0, now - this.last);
    this.tokens = Math.min(this.perMinute, this.tokens + (elapsed * this.perMinute) / 60_000);
    this.last = now;
  }

  /** Units available right now. */
  available(): number {
    this.refill();
    return this.tokens;
  }

  /** Milliseconds until `n` units are available (n is capped at capacity). */
  waitMs(n = 1): number {
    if (!Number.isFinite(this.perMinute)) return 0;
    const need = Math.min(n, this.perMinute);
    this.refill();
    return this.tokens >= need ? 0 : Math.ceil(((need - this.tokens) * 60_000) / this.perMinute);
  }

  /** Wait (if needed) and take `n` units. */
  async acquire(n = 1): Promise<void> {
    if (!Number.isFinite(this.perMinute)) return;
    for (;;) {
      const wait = this.waitMs(n);
      if (wait === 0) {
        this.tokens -= Math.min(n, this.perMinute);
        return;
      }
      await getClock().sleep(wait);
    }
  }

  /** Correct the balance after the fact (positive delta = more was used than reserved). */
  adjust(delta: number): void {
    if (!Number.isFinite(this.perMinute)) return;
    this.refill();
    this.tokens = Math.min(this.perMinute, this.tokens - delta);
  }

  /** Clamp to what the provider says is left (e.g. Groq `x-ratelimit-remaining-tokens`). */
  clampTo(remaining: number): void {
    if (!Number.isFinite(this.perMinute) || !Number.isFinite(remaining)) return;
    this.refill();
    this.tokens = Math.min(this.tokens, remaining);
  }
}

const rpmBuckets = new Map<string, TokenBucket>();
const tpmBuckets = new Map<string, TokenBucket>();

function getOrCreate(map: Map<string, TokenBucket>, id: string, perMinute: number): TokenBucket {
  let b = map.get(id);
  if (!b || b.perMinute !== perMinute) {
    b = new TokenBucket(perMinute);
    map.set(id, b);
  }
  return b;
}

/** Shared RPM bucket for a model (re-created if its configured RPM changed). */
export function bucketFor(spec: ModelSpec): TokenBucket {
  return getOrCreate(rpmBuckets, specId(spec), rpmFor(spec));
}

/** Shared TPM bucket for a model (unlimited = Infinity capacity, never waits). */
export function tokenBucketFor(spec: ModelSpec): TokenBucket {
  return getOrCreate(tpmBuckets, specId(spec), tpmFor(spec));
}

/** Rough token estimate for a prompt: chars/4 + reserved output tokens (+ ~260 per image). */
export function estimateTokens(system: string, user: string, maxOutputTokens: number, images = 0): number {
  return Math.ceil((system.length + user.length) / 4) + maxOutputTokens + images * 260;
}

/** Drop all buckets (tests). */
export function resetLimiters(): void {
  rpmBuckets.clear();
  tpmBuckets.clear();
}
