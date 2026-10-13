/**
 * Daily request accounting. The default counter is in-memory; the pipeline
 * can inject a DB-backed one (e.g. Supabase `usage` table) via
 * `setUsageCounter()` so budgets survive across serverless instances.
 */
import { utcDay } from "./clock";
import type { ModelSpec } from "./types";

/** Minimal counter interface (keys like `llm:gemini:gemini-2.5-flash:2026-10-13`). */
export interface UsageCounter {
  /** Add `n` (default 1) and return the new total. */
  incr(key: string, n?: number): Promise<number>;
  get(key: string): Promise<number>;
}

/** Simple in-process counter. */
export class MemoryUsageCounter implements UsageCounter {
  private readonly map = new Map<string, number>();

  async incr(key: string, n = 1): Promise<number> {
    const next = (this.map.get(key) ?? 0) + n;
    this.map.set(key, next);
    return next;
  }

  async get(key: string): Promise<number> {
    return this.map.get(key) ?? 0;
  }
}

let counter: UsageCounter = new MemoryUsageCounter();

/** Inject a persistent counter. Pass nothing to reset to a fresh in-memory one. */
export function setUsageCounter(c?: UsageCounter): void {
  counter = c ?? new MemoryUsageCounter();
}

/** The active counter. */
export function getUsageCounter(): UsageCounter {
  return counter;
}

/** Token usage key for a model on a UTC day (`llm-tok:groq:openai/gpt-oss-120b:2026-10-13`). */
export function tokenKey(spec: ModelSpec, day: string = utcDay()): string {
  return `llm-tok:${spec.provider}:${spec.model}:${day}`;
}

/** Request usage key for a model on a UTC day. */
export function usageKey(spec: ModelSpec, day: string = utcDay()): string {
  return `llm:${spec.provider}:${spec.model}:${day}`;
}
