import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Debrief } from "@/lib/contracts";
import { chooseDateMode, getBudgetSnapshot } from "@/lib/llm/budget";
import { setClock } from "@/lib/llm/clock";
import { LLMError, ProviderError, QuotaExhaustedError } from "@/lib/llm/errors";
import { resetLimiters } from "@/lib/llm/limiter";
import { complete, resetProviders, setProvider, setRouterOptions } from "@/lib/llm/router";
import { getUsageCounter, setUsageCounter, tokenKey, usageKey } from "@/lib/llm/usage";
import { fakeProvider, restoreEnv, setEnv, virtualClock } from "./helpers";

const Schema = z.object({ answer: z.string(), score: z.number() });
const ok = JSON.stringify({ answer: "hi", score: 3 });
const args = { task: "debrief" as const, system: "sys", user: "user prompt", schema: Schema };
const rl = () => new ProviderError("rate_limit", "429 per minute", { status: 429 });

let clock: ReturnType<typeof virtualClock>;

beforeEach(() => {
  setEnv({ MOCK_EXTERNALS: "0", LLM_CHAIN_DEBRIEF: "gemini:g1,groq:q1", LLM_CHAIN_DATE: "gemini:g1,groq:q1", LLM_CHAIN_ANALYSIS: "gemini:g1,groq:q1" });
  setUsageCounter();
  resetLimiters();
  setRouterOptions({ backoffBaseMs: 10 });
  clock = virtualClock();
});

afterEach(() => {
  restoreEnv();
  resetProviders();
  setRouterOptions();
  setClock();
  resetLimiters();
});

describe("LLM router", () => {
  it("LLM-01 happy path: structured output validated, model recorded, fences stripped", async () => {
    const g = fakeProvider("gemini", ["```json\n" + ok + "\n```"]);
    setProvider("gemini", g);
    setProvider("groq", fakeProvider("groq", [ok]));
    const res = await complete(args);
    expect(res).toEqual({ data: { answer: "hi", score: 3 }, model: "g1", provider: "gemini" });
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].jsonSchema).toBeTruthy();
    expect(JSON.stringify(g.calls[0].jsonSchema)).not.toMatch(/\$schema|additionalProperties/);
  });

  it("LLM-02 429 → backoff with retries on same model, then falls back to Groq once", async () => {
    const g = fakeProvider("gemini", [rl()]);
    const q = fakeProvider("groq", [ok]);
    setProvider("gemini", g);
    setProvider("groq", q);
    const res = await complete(args);
    expect(res.provider).toBe("groq");
    expect(g.calls).toHaveLength(3); // 1 + 2 retries
    expect(q.calls).toHaveLength(1); // single artifact, no duplicate side effects
    const backoffs = clock.slept.filter((ms) => ms >= 10);
    expect(backoffs.length).toBeGreaterThanOrEqual(2);
    expect(backoffs[1]).toBeGreaterThan(backoffs[0] * 1.2); // exponential
  });

  it("treats 503 'high demand' as retryable once, then next model", async () => {
    const g = fakeProvider("gemini", [new ProviderError("server", "503 high demand", { status: 503 })]);
    setProvider("gemini", g);
    setProvider("groq", fakeProvider("groq", [ok]));
    const res = await complete(args);
    expect(res.provider).toBe("groq");
    expect(g.calls).toHaveLength(2);
  });

  it("LLM-03 all providers rate limited → QuotaExhaustedError with ETA", async () => {
    setProvider("gemini", fakeProvider("gemini", [new ProviderError("rate_limit", "429", { status: 429, retryAfterSec: 45 })]));
    setProvider("groq", fakeProvider("groq", [new ProviderError("quota_day", "429 requests per day", { status: 429 })]));
    setRouterOptions({ backoffBaseMs: 10, maxWaitMs: 10 }); // 45s retry-after > max wait → move on
    const err = await complete(args).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExhaustedError);
    expect(err.retryAfterSec).toBe(45);
    expect(err.attempts.length).toBeGreaterThanOrEqual(2);
  });

  it("LLM-04 malformed JSON → one repair attempt → next provider", async () => {
    const g = fakeProvider("gemini", ["this is not json {", "still not json"]);
    const q = fakeProvider("groq", [ok]);
    setProvider("gemini", g);
    setProvider("groq", q);
    const res = await complete(args);
    expect(g.calls).toHaveLength(2);
    expect(g.calls[1].user).toContain("Your previous reply could not be used");
    expect(g.calls[1].user).toContain("invalid JSON");
    expect(res.provider).toBe("groq");
  });

  it("LLM-04b repair succeeds on the same model", async () => {
    const g = fakeProvider("gemini", ["oops", ok]);
    setProvider("gemini", g);
    setProvider("groq", fakeProvider("groq", [ok]));
    const res = await complete(args);
    expect(res.provider).toBe("gemini");
    expect(g.calls).toHaveLength(2);
  });

  it("LLM-05 schema-violating JSON is treated as invalid → repair/fallback", async () => {
    const g = fakeProvider("gemini", [JSON.stringify({ answer: "x" }), JSON.stringify({ nope: 1 })]);
    const q = fakeProvider("groq", [ok]);
    setProvider("gemini", g);
    setProvider("groq", q);
    const res = await complete(args);
    expect(g.calls[1].user).toContain("schema validation failed");
    expect(g.calls[1].user).toContain("score");
    expect(res.provider).toBe("groq");
  });

  it("coerces numeric strings / boolean strings and drops nulls for defaulted fields", async () => {
    setProvider("gemini", fakeProvider("gemini", [JSON.stringify({ chemistry: "7.5", verdict: "v", secondDate: "true", reason: "r", clicked: null })]));
    const res = await complete({ ...args, schema: Debrief });
    expect(res.data.chemistry).toBe(7.5);
    expect(res.data.secondDate).toBe(true);
    expect(res.data.clicked).toEqual([]);
  });

  it("LLM-06 RPM bucket: the 11th call within a second waits instead of hitting 429", async () => {
    setEnv({ LLM_RPM_GEMINI: "10" });
    setProvider("gemini", fakeProvider("gemini", [ok]));
    const t0 = clock.now();
    for (let i = 0; i < 10; i++) await complete(args);
    expect(clock.now() - t0).toBe(0);
    await complete(args);
    expect(clock.now() - t0).toBeGreaterThanOrEqual(5900);
  });

  it("LLM-07 RPD counter increments per model per UTC day and crossing the cap routes to fallback", async () => {
    setEnv({ LLM_RPD_GEMINI: "2" });
    const g = fakeProvider("gemini", [ok]);
    const q = fakeProvider("groq", [ok]);
    setProvider("gemini", g);
    setProvider("groq", q);
    await complete(args);
    await complete(args);
    const third = await complete(args);
    expect(third.provider).toBe("groq");
    expect(g.calls).toHaveLength(2);
    expect(await getUsageCounter().get(usageKey({ provider: "gemini", model: "g1" }, "2026-10-13"))).toBe(2);
  });

  it("a 'per day' 429 exhausts the model for the rest of the day", async () => {
    const g = fakeProvider("gemini", [new ProviderError("quota_day", "Quota exceeded: GenerateRequestsPerDayPerProjectPerModel", { status: 429 })]);
    const q = fakeProvider("groq", [ok]);
    setProvider("gemini", g);
    setProvider("groq", q);
    await complete(args);
    await complete(args);
    expect(g.calls).toHaveLength(1);
    expect(q.calls).toHaveLength(2);
  });

  it("TPD: skips a token-bound model when the day's token budget would be exceeded", async () => {
    setEnv({ LLM_CHAIN_DEBRIEF: "groq:q1,gemini:g1", LLM_TPD_GROQ: "1000" });
    await getUsageCounter().incr(tokenKey({ provider: "groq", model: "q1" }), 900);
    const q = fakeProvider("groq", [ok]);
    setProvider("groq", q);
    setProvider("gemini", fakeProvider("gemini", [ok]));
    const res = await complete({ ...args, maxOutputTokens: 200 });
    expect(res.provider).toBe("gemini");
    expect(q.calls).toHaveLength(0);
  });

  it("TPM: waits for the token bucket and records provider-reported tokens", async () => {
    setEnv({ LLM_CHAIN_DEBRIEF: "groq:q1", LLM_TPM_GROQ: "1000" });
    const q = fakeProvider("groq", [async () => ({ text: ok, totalTokens: 700 })]);
    setProvider("groq", q);
    const t0 = clock.now();
    await complete({ ...args, maxOutputTokens: 600 });
    await complete({ ...args, maxOutputTokens: 600 });
    expect(clock.now() - t0).toBeGreaterThan(10_000);
    expect(await getUsageCounter().get(tokenKey({ provider: "groq", model: "q1" }))).toBe(1400);
  });

  it("LLM-08 budget guard: chooseDateMode → compact when remaining DATE capacity is low", async () => {
    setEnv({ LLM_RPD_GEMINI: "5", LLM_RPD_GROQ: "5" });
    setProvider("gemini", fakeProvider("gemini", [ok]));
    setProvider("groq", fakeProvider("groq", [ok]));
    const snap = await getBudgetSnapshot();
    expect(snap.date).toBe(10);
    expect(await chooseDateMode()).toBe("compact");
    setEnv({ LLM_RPD_GEMINI: "240", LLM_RPD_GROQ: "950" });
    expect(await chooseDateMode()).toBe("full");
  });

  it("LLM-08b mock mode always has a full-date budget", async () => {
    setEnv({ MOCK_EXTERNALS: "1" });
    expect(await chooseDateMode()).toBe("full");
  });

  it("LLM-10 timeout: aborted at the deadline, counted as failure, fallback proceeds", async () => {
    setEnv({ LLM_TIMEOUT_MS: "30" });
    const signals: AbortSignal[] = [];
    const hang = fakeProvider("gemini", [
      (req) => {
        signals.push(req.signal);
        return new Promise(() => {});
      },
    ]);
    setProvider("gemini", hang);
    setProvider("groq", fakeProvider("groq", [ok]));
    const res = await complete(args);
    expect(res.provider).toBe("groq");
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("only sends images to vision-capable models", async () => {
    const g = fakeProvider("gemini", [ok], { vision: true });
    setProvider("gemini", g);
    await complete({ ...args, images: ["data:image/jpeg;base64,AAAA"] });
    expect(g.calls[0].images).toHaveLength(1);
    const q = fakeProvider("groq", [ok]);
    setEnv({ LLM_CHAIN_DEBRIEF: "groq:q1" });
    setProvider("groq", q);
    await complete({ ...args, images: ["data:image/jpeg;base64,AAAA"] });
    expect(q.calls[0].images).toHaveLength(0);
  });

  it("throws LLMError when nothing is configured and when every model returns garbage", async () => {
    const off = { ...fakeProvider("gemini", [ok]), isAvailable: () => false };
    setProvider("gemini", off);
    setProvider("groq", { ...fakeProvider("groq", [ok]), isAvailable: () => false });
    await expect(complete(args)).rejects.toThrow(/No LLM provider configured/);
    setProvider("gemini", fakeProvider("gemini", ["nope"]));
    setProvider("groq", fakeProvider("groq", ["nope"]));
    const err = await complete(args).catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err).not.toBeInstanceOf(QuotaExhaustedError);
  });
});
