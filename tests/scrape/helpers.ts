import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CanonicalLinks } from "@/lib/contracts";
import type { ApifyLike, RunInfo, StartOptions } from "@/lib/scrape";

/** Loads a raw Apify dataset fixture from tests/fixtures/apify. */
export function fixture(name: string): unknown[] {
  return JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "apify", name), "utf8")) as unknown[];
}

/** Builds canonical links for a slug/handle pair. */
export function link(slug: string, handle: string): CanonicalLinks {
  return {
    linkedinUrl: `https://www.linkedin.com/in/${slug}`,
    linkedinSlug: slug,
    instagramHandle: handle,
    instagramUrl: `https://www.instagram.com/${handle}/`,
  };
}

/** An error shaped like apify-client's ApifyApiError. */
export function apiError(statusCode: number, message: string, type?: string): Error & { statusCode: number; type?: string } {
  return Object.assign(new Error(message), { statusCode, type });
}

type StartCall = { actorId: string; input: Record<string, unknown>; options: StartOptions };

/**
 * In-memory fake of the Apify API. Configure per actor: queued start errors,
 * the dataset each run will produce, and the status sequence returned by getRun.
 */
export class FakeApify implements ApifyLike {
  starts: StartCall[] = [];
  getRunCalls: string[] = [];
  listCalls: string[] = [];
  startErrors = new Map<string, unknown[]>();
  datasets = new Map<string, unknown[]>(); // by actorId
  statusSeq = new Map<string, string[]>(); // by actorId; last value repeats
  statusMessage = new Map<string, string>();
  private runs = new Map<string, { actorId: string; polls: number }>();

  async startActor(actorId: string, input: Record<string, unknown>, options: StartOptions): Promise<RunInfo> {
    this.starts.push({ actorId, input, options });
    const errs = this.startErrors.get(actorId);
    if (errs?.length) throw errs.shift();
    const id = `run-${this.starts.length}`;
    this.runs.set(id, { actorId, polls: 0 });
    return { id, status: "READY", defaultDatasetId: `ds-${id}` };
  }

  async getRun(runId: string): Promise<RunInfo | null> {
    this.getRunCalls.push(runId);
    const r = this.runs.get(runId);
    if (!r) return null;
    const seq = this.statusSeq.get(r.actorId) ?? ["SUCCEEDED"];
    const status = seq[Math.min(r.polls, seq.length - 1)];
    r.polls++;
    return { id: runId, status, defaultDatasetId: `ds-${runId}`, statusMessage: this.statusMessage.get(r.actorId) ?? null };
  }

  async listItems(datasetId: string): Promise<unknown[]> {
    this.listCalls.push(datasetId);
    const runId = datasetId.replace(/^ds-/, "");
    const r = this.runs.get(runId);
    return r ? structuredClone(this.datasets.get(r.actorId) ?? []) : [];
  }
}

type Json = Record<string, unknown>;

/** First item of a fixture as a mutable deep copy. */
export function fixtureItem(name: string, index = 0): Json {
  return structuredClone(fixture(name)[index]) as Json;
}

/** Re-labels the real harvestapi item as another person (for multi-person batch tests). */
export function harvestAs(slug: string, firstName: string): Json {
  const it = fixtureItem("linkedin.harvestapi.json");
  return { ...it, publicIdentifier: slug, linkedinUrl: `https://www.linkedin.com/in/${slug}`, firstName, originalQuery: { url: `https://www.linkedin.com/in/${slug}` } };
}

/** Re-labels the real Instagram item as another handle. */
export function instagramAs(handle: string): Json {
  const it = fixtureItem("instagram.profile.json");
  return { ...it, username: handle, inputUrl: `https://www.instagram.com/${handle}`, url: `https://www.instagram.com/${handle}` };
}
