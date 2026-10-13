import { setClock, type Clock } from "@/lib/llm/clock";
import { ProviderError } from "@/lib/llm/errors";
import type { LLMProvider, ProviderName, ProviderRequest, ProviderResponse } from "@/lib/llm/types";

/** Virtual clock: sleep() advances time instantly. */
export function virtualClock(start = Date.UTC(2026, 9, 13, 12, 0, 0)): Clock & { slept: number[] } {
  let t = start;
  const slept: number[] = [];
  const c = {
    slept,
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
  };
  setClock(c);
  return c;
}

type Step = string | ProviderError | ((req: ProviderRequest) => Promise<ProviderResponse>);

/** Programmable fake provider. Steps are consumed in order; the last repeats. */
export function fakeProvider(name: ProviderName, steps: Step[], opts: { vision?: boolean } = {}): LLMProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    name,
    calls,
    isAvailable: () => true,
    supportsVision: () => opts.vision ?? false,
    async generate(req) {
      calls.push(req);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof ProviderError) throw step;
      if (typeof step === "function") return step(req);
      return { text: step, totalTokens: 100 };
    },
  };
}

/** Env vars a router test sets; restored by `restoreEnv`. */
const KEYS = [
  "MOCK_EXTERNALS",
  "LLM_CHAIN_ANALYSIS",
  "LLM_CHAIN_DATE",
  "LLM_CHAIN_DEBRIEF",
  "LLM_RPM_GEMINI",
  "LLM_RPM_GROQ",
  "LLM_RPD_GEMINI",
  "LLM_RPD_GROQ",
  "LLM_TPM_GROQ",
  "LLM_TPD_GROQ",
  "LLM_TIMEOUT_MS",
] as const;
const saved: Record<string, string | undefined> = {};

export function setEnv(vars: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const k of KEYS) if (!(k in saved)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

export function restoreEnv(): void {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete saved[k];
  }
}
