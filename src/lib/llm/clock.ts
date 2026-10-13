/**
 * Injectable clock so rate limiting, backoff and day-keys are testable
 * without real waiting.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))),
};

let current: Clock = realClock;

/** Current clock (real by default). */
export function getClock(): Clock {
  return current;
}

/** Replace the clock (tests). Pass nothing to restore the real one. */
export function setClock(clock?: Clock): void {
  current = clock ?? realClock;
}

/** UTC day string `YYYY-MM-DD` for a timestamp. */
export function utcDay(ts: number = getClock().now()): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Seconds until the next UTC midnight (when daily free-tier quotas reset). */
export function secondsUntilUtcMidnight(ts: number = getClock().now()): number {
  const d = new Date(ts);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - ts) / 1000));
}
