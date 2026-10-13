/**
 * Deterministic offline provider (MOCK_EXTERNALS=1). It reads the same
 * prompts a real model would and derives schema-valid JSON from them, so
 * the whole pipeline runs end to end without network or keys.
 */
import type { LLMProvider, ProviderRequest, ProviderResponse } from "../types";
import { mockRead, mockSynthesize } from "./analysis";
import { mockCompact, mockDebrief, mockPlan, mockTurn } from "./dating";

/** Produce the mock JSON object for a request. */
export function mockGenerate(req: Pick<ProviderRequest, "task" | "system" | "user">): unknown {
  // A repair prompt repeats the original user prompt first; strip the appendix.
  const user = req.user.split("\n\n---\nYour previous reply could not be used.")[0];
  switch (req.task) {
    case "read":
      return mockRead(user);
    case "synthesize":
      return mockSynthesize(user);
    case "plan":
      return mockPlan(user);
    case "turn":
      return mockTurn(req.system, user);
    case "debrief":
      return mockDebrief(req.system, user);
    case "compact_date":
      return mockCompact(req.system, user);
  }
}

/** The mock provider (always available, no vision, no network). */
export const mockProvider: LLMProvider = {
  name: "mock",
  isAvailable: () => true,
  supportsVision: () => false,
  async generate(req: ProviderRequest): Promise<ProviderResponse> {
    const data = mockGenerate(req);
    const text = JSON.stringify(data);
    return { text, totalTokens: Math.ceil((req.system.length + req.user.length + text.length) / 4) };
  },
};
