import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ProfileAnalysis } from "@/lib/contracts";
import { setClock } from "@/lib/llm/clock";
import { DEFAULT_CHAINS, getChain, parseChain } from "@/lib/llm/config";
import { classifyHttpError, parseRetryAfter } from "@/lib/llm/errors";
import { extractJsonText, parseJsonLoose } from "@/lib/llm/json";
import { shapeHint, toProviderJsonSchema } from "@/lib/llm/jsonschema";
import { TokenBucket } from "@/lib/llm/limiter";
import { dataUrlToPart } from "@/lib/llm/providers/gemini";
import { restoreEnv, setEnv, virtualClock } from "./helpers";

afterEach(() => {
  setClock();
  restoreEnv();
});

describe("error classification", () => {
  it("Gemini per-minute 429 is rate_limit with retry delay", () => {
    const e = classifyHttpError(429, 'You exceeded your current quota. quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier". Please retry in 39.2s.');
    expect(e.kind).toBe("rate_limit");
    expect(e.retryAfterSec).toBeCloseTo(39.2);
  });
  it("Gemini per-day / limit 0 429 is quota_day", () => {
    expect(classifyHttpError(429, "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier").kind).toBe("quota_day");
    expect(classifyHttpError(429, "Quota exceeded for metric ... limit: 0, model: gemini-2.5-pro").kind).toBe("quota_day");
  });
  it("Groq TPM vs RPD", () => {
    const tpm = classifyHttpError(429, "Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000. Please try again in 1m2.5s.");
    expect(tpm.kind).toBe("rate_limit");
    expect(tpm.retryAfterSec).toBeCloseTo(62.5);
    expect(classifyHttpError(429, "on requests per day (RPD): Limit 1000").kind).toBe("quota_day");
  });
  it("503 → server (retryable), 401 → auth, 400 → bad_request", () => {
    expect(classifyHttpError(503, "The model is overloaded").retryable).toBe(true);
    expect(classifyHttpError(401, "bad key").kind).toBe("auth");
    expect(classifyHttpError(400, "bad schema").kind).toBe("bad_request");
    expect(parseRetryAfter("12")).toBe(12);
  });
});

describe("json helpers", () => {
  it("strips fences and prose", () => {
    expect(extractJsonText('Sure! ```json\n{"a":1}\n``` hope that helps')).toBe('{"a":1}');
    expect(parseJsonLoose('Here: {"a": [1,2,],}')).toEqual({ a: [1, 2] });
  });
  it("simplified JSON schema has no unsupported keys and keeps enums", () => {
    const s = JSON.stringify(toProviderJsonSchema(ProfileAnalysis));
    expect(s).not.toMatch(/\$schema|additionalProperties|"default"|minItems|anyOf|"null"/);
    expect(s).toContain('"enum":["high","medium","low"]');
    const hint = shapeHint(toProviderJsonSchema(z.object({ a: z.number(), b: z.array(z.enum(["x", "y"])) })));
    expect(hint).toBe('{ a: number; b: Array<"x" | "y"> }');
  });
  it("parses data URLs into inline parts", () => {
    expect(dataUrlToPart("data:image/png;base64,QUJD")).toEqual({ inlineData: { mimeType: "image/png", data: "QUJD" } });
    expect(dataUrlToPart("https://x")).toBeNull();
  });
});

describe("config", () => {
  it("default chains follow the account's available models", () => {
    setEnv({ MOCK_EXTERNALS: "0", LLM_CHAIN_ANALYSIS: "", LLM_CHAIN_DATE: "" });
    expect(getChain("analysis")[0]).toEqual({ provider: "gemini", model: "gemini-3.5-flash" });
    expect(getChain("date").map((m) => m.model)).toContain("openai/gpt-oss-120b");
    expect(DEFAULT_CHAINS.debrief).toContain("gemini-2.5-flash-lite");
  });
  it("parses env chains and ignores unknown providers", () => {
    expect(parseChain("groq:openai/gpt-oss-120b, foo:bar ,gemini:x")).toEqual([
      { provider: "groq", model: "openai/gpt-oss-120b" },
      { provider: "gemini", model: "x" },
    ]);
  });
  it("mock mode → mock only", () => {
    setEnv({ MOCK_EXTERNALS: "1" });
    expect(getChain("date")).toEqual([{ provider: "mock", model: "mock-1" }]);
  });
});

describe("token bucket", () => {
  it("LLM-06 10 RPM: 10 immediate, the 11th waits ~6s", async () => {
    const clock = virtualClock();
    const b = new TokenBucket(10);
    for (let i = 0; i < 10; i++) {
      expect(b.waitMs()).toBe(0);
      await b.acquire();
    }
    expect(b.waitMs()).toBeGreaterThanOrEqual(5900);
    await b.acquire();
    expect(clock.slept.reduce((a, x) => a + x, 0)).toBeGreaterThanOrEqual(5900);
  });
});
