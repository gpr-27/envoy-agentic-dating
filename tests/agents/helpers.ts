import { DateRecord, type ProfileAnalysis, type ScrapeBundle } from "@/lib/contracts";
import { readPerson, synthesizeProfile } from "@/lib/agents";
import { mockProvider } from "@/lib/llm/mock";
import { resetProviders, setProvider } from "@/lib/llm/router";
import type { ProviderRequest } from "@/lib/llm/types";

export interface Recorded {
  task: ProviderRequest["task"];
  system: string;
  user: string;
  images: string[];
  keys: string[];
}

/** Wrap the mock provider so every prompt is recorded. */
export function recordPrompts(): { calls: Recorded[]; stop: () => void } {
  const calls: Recorded[] = [];
  setProvider("mock", {
    ...mockProvider,
    async generate(req) {
      calls.push({ task: req.task, system: req.system, user: req.user, images: req.images, keys: Object.keys(req) });
      return mockProvider.generate(req);
    },
  });
  return { calls, stop: resetProviders };
}

/** Run the reader agent end to end with the mock. */
export async function analyse(b: ScrapeBundle): Promise<ProfileAnalysis> {
  const { readingLog } = await readPerson(b);
  return (await synthesizeProfile(b, readingLog)).analysis;
}

/** A fresh planned date record. */
export function newDate(aId: string, bId: string): DateRecord {
  const now = "2026-10-13T00:00:00Z";
  return DateRecord.parse({ id: `${aId}-${bId}`, pool: "test", aId, bId, status: "planned", mode: "full", createdAt: now, updatedAt: now });
}
