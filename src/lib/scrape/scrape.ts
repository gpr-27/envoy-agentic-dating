/**
 * Async scrape orchestration: one batched Apify run per platform, polled on
 * pipeline ticks (never blocks for the whole run), with a LinkedIn fallback actor.
 */
import type { CanonicalLinks, NormalizedInstagram, NormalizedLinkedIn } from "@/lib/contracts";
import {
  ApifyQuotaError,
  errMessage,
  getApifyClient,
  isQuotaError,
  isQuotaRunMessage,
  isTerminal,
  rethrowQuota,
  ScrapeConfigError,
  type ApifyLike,
  type RunInfo,
} from "./apify";
import { isMockMode, scrapeConfig } from "./config";
import { instagramActorInput, instagramRunOptions, matchInstagramItems, type InstagramOutcome } from "./instagram";
import { linkedInActorInput, linkedInRunOptions, matchLinkedInItems, type LinkedInOutcome } from "./linkedin";
import { MOCK_ACTOR, mockInstagram, mockLinkedIn, mockRunId } from "./mock";
import type { LinkedInParseMeta } from "./normalize-linkedin";
import { asObj } from "./util";

/** Identifies the two runs of one scrape batch. */
export type ScrapeRunRef = { linkedinRunId: string; linkedinActor: string; instagramRunId: string };
/** Returned by {@link startScrape}; persist it to poll later. */
export type ScrapeStarted = ScrapeRunRef & { startedAt: string };

/** Scrape result for one person. */
export type PersonScrapeResult = {
  links: CanonicalLinks;
  linkedin: NormalizedLinkedIn | null;
  instagram: NormalizedInstagram | null;
  /** "not_found", "run_failed", or an actor error string. */
  linkedinError?: string;
  /** "not_found", "run_failed", or an actor error string. */
  instagramError?: string;
  /** Actor-reported parse quality (bovi `parse_confidence`/`warnings`), when present. */
  linkedinMeta?: LinkedInParseMeta;
};

/** Result of {@link pollScrape}. */
export type PollScrapeResult =
  | { state: "running" }
  | { state: "done"; results: PersonScrapeResult[]; linkedinRunFailed: boolean }
  | { state: "failed"; error: string; retryable: boolean };

/** Options for {@link startScrape}. */
export type StartScrapeOptions = {
  /** Override the primary LinkedIn actor (e.g. the fallback actor on retry). */
  linkedinActor?: string;
  /** Start attempts per actor before giving up (default 3). */
  attempts?: number;
  /** Base delay between start attempts in ms (default 1000; linear backoff). */
  retryDelayMs?: number;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** HTTP status from an apify-client error, if any. */
function statusOf(e: unknown): number {
  const s = asObj(e).statusCode;
  return typeof s === "number" ? s : 0;
}

/** Retries transient failures (5xx/408/429/network); never retries quota/config/4xx errors. */
async function withRetries<T>(fn: () => Promise<T>, attempts: number, delayMs: number): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof ScrapeConfigError || isQuotaError(e)) throw e;
      const s = statusOf(e);
      if (s >= 400 && s < 500 && s !== 408 && s !== 429) throw e;
      if (i < attempts - 1 && delayMs > 0) await sleep(delayMs * (i + 1));
    }
  }
  throw last;
}

function assertLinks(links: CanonicalLinks[]): void {
  if (!links.length) throw new Error("startScrape needs at least one person.");
}

/** Starts one LinkedIn run for all links. Returns the run id. Quota → {@link ApifyQuotaError}. */
export async function startLinkedInRun(links: CanonicalLinks[], actor: string, opts: StartScrapeOptions = {}): Promise<string> {
  assertLinks(links);
  if (isMockMode()) return mockRunId("li", links);
  const client = getApifyClient();
  try {
    const run = await withRetries(
      () => client.startActor(actor, linkedInActorInput(actor, links), linkedInRunOptions(actor, links.length)),
      opts.attempts ?? 3,
      opts.retryDelayMs ?? 1000,
    );
    return run.id;
  } catch (e) {
    rethrowQuota(e, `starting LinkedIn actor ${actor}`);
  }
}

/** Starts one Instagram run for all handles. Returns the run id. Quota → {@link ApifyQuotaError}. */
export async function startInstagramRun(links: CanonicalLinks[], opts: StartScrapeOptions = {}): Promise<string> {
  assertLinks(links);
  if (isMockMode()) return mockRunId("ig", links);
  const client = getApifyClient();
  const actor = scrapeConfig().instagramActor;
  try {
    const run = await withRetries(
      () => client.startActor(actor, instagramActorInput(links), instagramRunOptions(links.length)),
      opts.attempts ?? 3,
      opts.retryDelayMs ?? 1000,
    );
    return run.id;
  } catch (e) {
    rethrowQuota(e, `starting Instagram actor ${actor}`);
  }
}

/**
 * Starts ONE async run per platform with all links batched. If the primary
 * LinkedIn actor cannot be started (after retries), the fallback actor is started instead.
 * Throws {@link ApifyQuotaError} on exhausted credit, {@link ScrapeConfigError} without a token.
 */
export async function startScrape(links: CanonicalLinks[], opts: StartScrapeOptions = {}): Promise<ScrapeStarted> {
  assertLinks(links);
  const cfg = scrapeConfig();
  const startedAt = new Date().toISOString();
  if (isMockMode()) {
    return { linkedinRunId: mockRunId("li", links), linkedinActor: MOCK_ACTOR, instagramRunId: mockRunId("ig", links), startedAt };
  }
  const instagramRunId = await startInstagramRun(links, opts);
  const primary = opts.linkedinActor ?? cfg.linkedinActor;
  try {
    const linkedinRunId = await startLinkedInRun(links, primary, opts);
    return { linkedinRunId, linkedinActor: primary, instagramRunId, startedAt };
  } catch (e) {
    if (e instanceof ApifyQuotaError || e instanceof ScrapeConfigError || cfg.linkedinFallbackActor === primary) throw e;
    const linkedinRunId = await startLinkedInRun(links, cfg.linkedinFallbackActor, opts);
    return { linkedinRunId, linkedinActor: cfg.linkedinFallbackActor, instagramRunId, startedAt };
  }
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

type Collected<T> = { runFailed: boolean; runError?: string; outcomes: Map<string, T> };

async function getRunSafe(client: ApifyLike, runId: string): Promise<RunInfo | null> {
  try {
    return await client.getRun(runId);
  } catch (e) {
    rethrowQuota(e, "reading run status");
  }
}

async function itemsOf(client: ApifyLike, run: RunInfo, tolerateErrors: boolean): Promise<unknown[]> {
  try {
    return await client.listItems(run.defaultDatasetId, { limit: 1000 });
  } catch (e) {
    if (tolerateErrors && !isQuotaError(e)) return [];
    rethrowQuota(e, "reading dataset items");
  }
}

function checkRunQuota(run: RunInfo, platform: string): void {
  if (run.status !== "SUCCEEDED" && isQuotaRunMessage(run.statusMessage)) {
    throw new ApifyQuotaError(`Apify ${platform} run ${run.status}: ${run.statusMessage ?? "usage limit reached"}`);
  }
}

async function collectLinkedIn(client: ApifyLike, run: RunInfo | null, actor: string, links: CanonicalLinks[]): Promise<Collected<LinkedInOutcome>> {
  if (!run) return { runFailed: true, runError: "run_not_found", outcomes: new Map(links.map((l) => [l.linkedinSlug, { linkedin: null, error: "run_failed" }])) };
  checkRunQuota(run, "LinkedIn");
  const ok = run.status === "SUCCEEDED";
  const outcomes = matchLinkedInItems(await itemsOf(client, run, !ok), links, actor);
  if (!ok) for (const o of outcomes.values()) if (!o.linkedin && o.error === "not_found") o.error = "run_failed";
  return { runFailed: !ok, runError: ok ? undefined : `${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`, outcomes };
}

async function collectInstagram(client: ApifyLike, run: RunInfo | null, actor: string, links: CanonicalLinks[]): Promise<Collected<InstagramOutcome>> {
  if (!run) return { runFailed: true, runError: "run_not_found", outcomes: new Map(links.map((l) => [l.instagramHandle, { instagram: null, error: "run_failed" }])) };
  checkRunQuota(run, "Instagram");
  const ok = run.status === "SUCCEEDED";
  const outcomes = matchInstagramItems(await itemsOf(client, run, !ok), links, actor);
  if (!ok) for (const o of outcomes.values()) if (!o.instagram && o.error === "not_found") o.error = "run_failed";
  return { runFailed: !ok, runError: ok ? undefined : `${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ""}`, outcomes };
}

function mockOutcomes(links: CanonicalLinks[]): PersonScrapeResult[] {
  return links.map((l) => {
    const linkedin = mockLinkedIn(l);
    const instagram = mockInstagram(l);
    return {
      links: l,
      linkedin,
      instagram,
      ...(linkedin ? {} : { linkedinError: "not_found" }),
      ...(instagram ? {} : { instagramError: "not_found" }),
    };
  });
}

function isMockRef(id: string): boolean {
  return id.startsWith("mock-");
}

/**
 * Polls a LinkedIn run on its own (e.g. a fallback-actor retry).
 * `running` while in progress; otherwise per-link outcomes keyed by slug.
 */
export async function pollLinkedInRun(
  runId: string,
  actor: string,
  links: CanonicalLinks[],
): Promise<{ state: "running" } | { state: "done"; runFailed: boolean; results: Map<string, LinkedInOutcome> }> {
  if (isMockMode() || isMockRef(runId)) {
    return { state: "done", runFailed: false, results: new Map(links.map((l) => { const li = mockLinkedIn(l); return [l.linkedinSlug, li ? { linkedin: li } : { linkedin: null, error: "not_found" }]; })) };
  }
  const client = getApifyClient();
  const run = await getRunSafe(client, runId);
  if (run && !isTerminal(run.status)) return { state: "running" };
  const c = await collectLinkedIn(client, run, actor, links);
  return { state: "done", runFailed: c.runFailed, results: c.outcomes };
}

/**
 * Checks both runs. While either is in progress → `running` (no dataset reads).
 * When both are terminal, reads both datasets and maps items back to links.
 * A failed LinkedIn run yields `linkedinRunFailed: true` (retry with the fallback actor);
 * a failed Instagram run with missing profiles yields `failed` (retryable).
 * Idempotent: safe to call repeatedly. Quota problems throw {@link ApifyQuotaError}.
 */
export async function pollScrape(r: ScrapeRunRef, links: CanonicalLinks[]): Promise<PollScrapeResult> {
  if (isMockMode() || (isMockRef(r.linkedinRunId) && isMockRef(r.instagramRunId))) {
    return { state: "done", results: mockOutcomes(links), linkedinRunFailed: false };
  }
  const cfg = scrapeConfig();
  try {
    const client = getApifyClient();
    const [liRun, igRun] = await Promise.all([getRunSafe(client, r.linkedinRunId), getRunSafe(client, r.instagramRunId)]);
    if ((liRun && !isTerminal(liRun.status)) || (igRun && !isTerminal(igRun.status))) return { state: "running" };

    const [li, ig] = await Promise.all([
      collectLinkedIn(client, liRun, r.linkedinActor, links),
      collectInstagram(client, igRun, cfg.instagramActor, links),
    ]);
    const igMissing = links.filter((l) => !ig.outcomes.get(l.instagramHandle)?.instagram).length;
    if (ig.runFailed && igMissing > 0) {
      return { state: "failed", error: `Instagram run ${ig.runError ?? "failed"}`, retryable: true };
    }
    const results = links.map<PersonScrapeResult>((l) => {
      const lo = li.outcomes.get(l.linkedinSlug) ?? { linkedin: null, error: "not_found" };
      const io = ig.outcomes.get(l.instagramHandle) ?? { instagram: null, error: "not_found" };
      return {
        links: l,
        linkedin: lo.linkedin,
        instagram: io.instagram,
        ...(lo.error ? { linkedinError: lo.error } : {}),
        ...(io.error ? { instagramError: io.error } : {}),
        ...(lo.meta ? { linkedinMeta: lo.meta } : {}),
      };
    });
    return { state: "done", results, linkedinRunFailed: li.runFailed };
  } catch (e) {
    if (e instanceof ApifyQuotaError || e instanceof ScrapeConfigError) throw e;
    return { state: "failed", error: errMessage(e), retryable: true };
  }
}

/** Options for {@link scrapeNow}. */
export type ScrapeNowOptions = StartScrapeOptions & {
  /** Poll interval (default 5000 ms). */
  pollIntervalMs?: number;
  /** Overall deadline (default 10 minutes). */
  timeoutMs?: number;
  /** Retry missing LinkedIn profiles with the fallback actor (default true). */
  useFallback?: boolean;
};

/**
 * Local-script convenience: start, poll until done, and retry LinkedIn profiles
 * that failed/were missing with the fallback actor. Throws on failure/timeout.
 */
export async function scrapeNow(links: CanonicalLinks[], opts: ScrapeNowOptions = {}): Promise<PersonScrapeResult[]> {
  const interval = opts.pollIntervalMs ?? 5000;
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  const started = await startScrape(links, opts);

  let done: Extract<PollScrapeResult, { state: "done" }> | null = null;
  while (!done) {
    const res = await pollScrape(started, links);
    if (res.state === "done") done = res;
    else if (res.state === "failed") throw new Error(`Scrape failed: ${res.error}`);
    else if (Date.now() > deadline) throw new Error("Scrape timed out waiting for Apify runs.");
    else await sleep(interval);
  }

  const fallback = scrapeConfig().linkedinFallbackActor;
  const retry = done.results.filter((r) => !r.linkedin && r.linkedinError !== undefined).map((r) => r.links);
  if (opts.useFallback === false || !retry.length || started.linkedinActor === fallback || isMockMode()) return done.results;

  const runId = await startLinkedInRun(retry, fallback, opts);
  for (;;) {
    const res = await pollLinkedInRun(runId, fallback, retry);
    if (res.state === "done") {
      return done.results.map((r) => {
        const o = res.results.get(r.links.linkedinSlug);
        if (!o?.linkedin) return r;
        const { linkedinError: _drop, ...rest } = r;
        void _drop;
        return { ...rest, linkedin: o.linkedin, ...(o.meta ? { linkedinMeta: o.meta } : {}) };
      });
    }
    if (Date.now() > deadline) return done.results;
    await sleep(interval);
  }
}
