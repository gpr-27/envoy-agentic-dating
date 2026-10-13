/**
 * The pipeline engine. Every call to tick() advances the pool's work by small,
 * idempotent, persisted steps until its time budget runs out:
 *
 *   queued → scraping (Apify runs) → scraped → analyzing (reader agent)
 *   → profiled → dating (dates: plan → turns → debriefs) → ranked
 *
 * Because each step is persisted before the next starts, a tick can be cut
 * off at any point (serverless timeout, crash) and the next tick resumes.
 */
import {
  FULL_DATE_TURNS,
  ScrapeBundle,
  type DateRecord,
  type Person,
  type ProfileRecord,
} from "@/lib/contracts";
import {
  compactDate,
  debrief,
  nextTurn,
  pairKey,
  pickDates,
  planDate,
  readPerson,
  synthesizeProfile,
} from "@/lib/agents";
import { chooseDateMode, QuotaExhaustedError, setUsageCounter } from "@/lib/llm";
import { ApifyQuotaError, captureImages, pollScrape, startScrape } from "@/lib/scrape";
import { getStore, type Store } from "@/lib/store";
import { newId, nowIso } from "./ids";
import { recomputeRankings } from "./rankings";

export interface TickResult {
  progressed: number;
  pendingWork: boolean;
  notice: string | null;
  log: string[];
}

export interface TickOptions {
  /** Stop starting new steps after this many ms. */
  budgetMs?: number;
  /** Parallel date steps per round. */
  dateConcurrency?: number;
  /** Parallel profile analyses per round. */
  analysisConcurrency?: number;
}

const SCRAPE_TIMEOUT_MS = 12 * 60_000;
const STALE_ANALYSIS_MS = 4 * 60_000;
const QUOTA_RETRY_MS = 90_000;
const MAX_ATTEMPTS = 3;
const MAX_DATE_ERRORS = 3;
const DATES_PER_PERSON = () => Math.max(1, Number(process.env.DATES_PER_PERSON ?? 2));
const LINKEDIN_FALLBACK = () =>
  process.env.APIFY_LINKEDIN_FALLBACK_ACTOR || "bovi/linkedin-profile-scraper";

const first = (name: string) => name.split(/\s+/)[0] || name;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Run `fn` over items with bounded parallelism. */
async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

class Ctx {
  progressed = 0;
  log: string[] = [];
  notice: string | null = null;
  readonly started = Date.now();
  constructor(
    readonly pool: string,
    readonly store: Store,
    readonly budgetMs: number,
  ) {}
  timeLeft() {
    return this.budgetMs - (Date.now() - this.started);
  }
  say(line: string) {
    this.log.push(line);
  }
}

/* ------------------------------------------------------------------ */
/* Scraping                                                            */
/* ------------------------------------------------------------------ */

/**
 * Apify's free plan caps some actors at 10 dataset items per run, so scrapes
 * are batched in groups of at most SCRAPE_BATCH people (one run per platform each).
 */
const SCRAPE_BATCH = () => Math.max(1, Number(process.env.SCRAPE_BATCH ?? 10));

const chunk = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Each batch uses 2 Apify runs; the free plan allows 5 concurrent runs. */
const MAX_ACTIVE_BATCHES = () => Math.max(1, Number(process.env.APIFY_MAX_ACTIVE_BATCHES ?? 2));

const isConcurrencyLimit = (e: unknown) => /concurrent (actor )?runs|memory limit/i.test(errMsg(e));

async function startQueued(ctx: Ctx, people: Person[]) {
  const active = new Set(
    people
      .filter((p) => p.status === "scraping" && p.scrape)
      .map((p) => `${p.scrape!.linkedinRunId}|${p.scrape!.instagramRunId}`),
  ).size;
  let slots = MAX_ACTIVE_BATCHES() - active;
  const queued = people.filter((p) => p.status === "queued");
  if (queued.length && slots <= 0) {
    ctx.say(`${queued.length} waiting for a free scraper slot`);
    return;
  }
  // People whose LinkedIn wasn't returned by the primary actor retry with the fallback actor.
  const fallback = queued.filter((p) => p.statusDetail === "retry-linkedin-fallback");
  const normal = queued.filter((p) => p.statusDetail !== "retry-linkedin-fallback");
  const groups: Array<[Person[], { linkedinActor?: string }]> = [
    ...chunk(normal, SCRAPE_BATCH()).map((g): [Person[], { linkedinActor?: string }] => [g, {}]),
    ...chunk(fallback, SCRAPE_BATCH()).map((g): [Person[], { linkedinActor?: string }] => [
      g,
      { linkedinActor: LINKEDIN_FALLBACK() },
    ]),
  ];
  for (const [group, opts] of groups) {
    if (slots-- <= 0) break;
    if (!(await startGroup(ctx, group, opts))) break;
  }
}

/** Start one batch. Returns false when Apify has no free capacity right now. */
async function startGroup(
  ctx: Ctx,
  group: Person[],
  opts: { linkedinActor?: string },
): Promise<boolean> {
  const links = group.map((p) => ({
    linkedinUrl: p.linkedinUrl,
    linkedinSlug: p.linkedinUrl.split("/in/")[1] ?? "",
    instagramHandle: p.instagramHandle,
    instagramUrl: p.instagramUrl,
  }));
  try {
    const run = await startScrape(links, opts);
    await Promise.all(
      group.map((p) =>
        ctx.store.updatePerson(p.id, {
          status: "scraping",
          statusDetail: "Apify is reading the LinkedIn and Instagram profiles",
          scrape: {
            linkedinRunId: run.linkedinRunId,
            linkedinActor: run.linkedinActor,
            instagramRunId: run.instagramRunId,
            startedAt: run.startedAt,
          },
        }),
      ),
    );
    ctx.progressed += group.length;
    ctx.say(
      `Started Apify scrapers for ${group.length} ${group.length === 1 ? "person" : "people"} (${group
        .map((p) => first(p.displayName))
        .join(", ")})${opts.linkedinActor ? " with the backup LinkedIn scraper" : ""}`,
    );
    return true;
  } catch (e) {
    if (isConcurrencyLimit(e)) {
      // Not a failure: the free plan's concurrent-run limit is reached. Try again next tick.
      ctx.say(`Scraper slots are busy — ${group.length} people will start shortly`);
      return false;
    }
    if (e instanceof ApifyQuotaError) {
      ctx.notice =
        "The free Apify scraping credit for this month is used up. New people can't be read until it resets.";
      ctx.say("Apify credit exhausted — scraping paused");
      return false;
    }
    ctx.say(`Could not start scrapers: ${errMsg(e)}`);
    await Promise.all(
      group.map((p) =>
        ctx.store.updatePerson(p.id, {
          status: p.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "queued",
          attempts: p.attempts + 1,
          error: errMsg(e),
        }),
      ),
    );
    return false;
  }
}

async function pollScraping(ctx: Ctx, people: Person[]) {
  const scraping = people.filter((p) => p.status === "scraping" && p.scrape);
  const groups = new Map<string, Person[]>();
  for (const p of scraping) {
    const k = `${p.scrape!.linkedinRunId}|${p.scrape!.instagramRunId}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const group of groups.values()) {
    if (ctx.timeLeft() <= 0) return;
    const s = group[0].scrape!;
    const links = group.map((p) => ({
      linkedinUrl: p.linkedinUrl,
      linkedinSlug: p.linkedinUrl.split("/in/")[1] ?? "",
      instagramHandle: p.instagramHandle,
      instagramUrl: p.instagramUrl,
    }));
    let res: Awaited<ReturnType<typeof pollScrape>>;
    try {
      res = await pollScrape(
        {
          linkedinRunId: s.linkedinRunId ?? "",
          linkedinActor: s.linkedinActor ?? "",
          instagramRunId: s.instagramRunId ?? "",
        },
        links,
      );
    } catch (e) {
      ctx.say(`Polling Apify failed: ${errMsg(e)}`);
      continue;
    }

    if (res.state === "running") {
      const age = Date.now() - new Date(s.startedAt ?? Date.now()).getTime();
      if (age > SCRAPE_TIMEOUT_MS) {
        await Promise.all(
          group.map((p) =>
            ctx.store.updatePerson(p.id, {
              status: "failed",
              error: "The scraper took too long. Press retry.",
              scrape: null,
            }),
          ),
        );
        ctx.progressed += group.length;
      } else {
        ctx.say(
          `Apify is still scraping ${group.map((p) => first(p.displayName)).join(", ")} (${Math.round(age / 1000)}s)`,
        );
      }
      continue;
    }

    if (res.state === "failed") {
      await Promise.all(
        group.map((p) =>
          ctx.store.updatePerson(p.id, {
            status: res.retryable && p.attempts + 1 < MAX_ATTEMPTS ? "queued" : "failed",
            attempts: p.attempts + 1,
            error: res.error,
            scrape: null,
          }),
        ),
      );
      ctx.progressed += group.length;
      ctx.say(`Scrape failed: ${res.error}`);
      continue;
    }

    for (const p of group) {
      const r = res.results.find(
        (x) => x.links.instagramHandle === p.instagramHandle && x.links.linkedinUrl === p.linkedinUrl,
      );
      ctx.progressed++;
      if (!r || !r.instagram) {
        await ctx.store.updatePerson(p.id, {
          status: "rejected_invalid",
          statusDetail: null,
          error: "We couldn't find a public Instagram profile at that link.",
          scrape: null,
        });
        ctx.say(`${first(p.displayName)}: Instagram profile not found`);
        continue;
      }
      if (r.instagram.isPrivate) {
        await ctx.store.updatePerson(p.id, {
          status: "rejected_private",
          statusDetail: null,
          error: "This Instagram account is private. Only public Instagram profiles are allowed.",
          scrape: null,
        });
        ctx.say(`${first(p.displayName)}: Instagram is private — rejected (public profiles only)`);
        continue;
      }
      if (!r.linkedin) {
        const usedFallback = s.linkedinActor === LINKEDIN_FALLBACK();
        if (!usedFallback) {
          await ctx.store.updatePerson(p.id, {
            status: "queued",
            statusDetail: "retry-linkedin-fallback",
            scrape: null,
          });
          ctx.say(`${first(p.displayName)}: LinkedIn not returned — retrying with the backup scraper`);
        } else {
          await ctx.store.updatePerson(p.id, {
            status: "rejected_invalid",
            statusDetail: null,
            error: "We couldn't read a public LinkedIn profile at that link.",
            scrape: null,
          });
          ctx.say(`${first(p.displayName)}: LinkedIn profile could not be read`);
        }
        continue;
      }
      const { images, photoDataUrl } = await captureImages(r.instagram);
      const bundle = ScrapeBundle.parse({
        linkedin: r.linkedin,
        instagram: r.instagram,
        images,
        photoDataUrl,
      });
      await ctx.store.saveSources(p.id, ctx.pool, bundle);
      const realName = r.linkedin.fullName || r.instagram.fullName || p.displayName;
      await ctx.store.updatePerson(p.id, {
        status: "scraped",
        statusDetail: "Profiles fetched — the agent is about to read them",
        displayName: realName,
        photoDataUrl,
        error: null,
        scrape: null,
      });
      ctx.say(
        `${first(realName)}: fetched LinkedIn (${r.linkedin.experience.length} roles) and Instagram (${r.instagram.posts.length} posts)`,
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reading / analysis                                                  */
/* ------------------------------------------------------------------ */

async function analyze(ctx: Ctx, people: Person[], concurrency: number) {
  const now = Date.now();
  const ready = people.filter(
    (p) =>
      p.status === "scraped" ||
      (p.status === "analyzing" && now - new Date(p.updatedAt).getTime() > STALE_ANALYSIS_MS) ||
      (p.status === "waiting_quota" && now - new Date(p.updatedAt).getTime() > QUOTA_RETRY_MS),
  );
  if (!ready.length) return;
  await mapLimit(ready, concurrency, async (p) => {
    if (ctx.timeLeft() <= 0) return;
    const bundle = await ctx.store.getSources(p.id);
    if (!bundle) {
      await ctx.store.updatePerson(p.id, { status: "queued", statusDetail: "Re-fetching sources" });
      return;
    }
    await ctx.store.updatePerson(p.id, {
      status: "analyzing",
      statusDetail: `${first(p.displayName)}'s agent is reading LinkedIn and Instagram`,
    });
    ctx.say(`${first(p.displayName)}'s agent is reading their LinkedIn and Instagram…`);
    try {
      const read = await readPerson(bundle);
      await ctx.store.updatePerson(p.id, {
        statusDetail: `${first(p.displayName)}'s agent is writing the profile`,
      });
      const synth = await synthesizeProfile(bundle, read.readingLog);
      const rec: ProfileRecord = {
        personId: p.id,
        readingLog: read.readingLog,
        analysis: synth.analysis,
        models: [...new Set([read.model, synth.model])],
        createdAt: nowIso(),
      };
      await ctx.store.saveProfile(ctx.pool, rec);
      const mismatch = synth.analysis.identity.samePerson === "unlikely";
      await ctx.store.updatePerson(p.id, {
        status: mismatch ? "identity_mismatch" : "profiled",
        statusDetail: mismatch ? synth.analysis.identity.reasons.join("; ") : "Profile ready",
        displayName: synth.analysis.displayName || p.displayName,
        error: null,
        attempts: 0,
      });
      ctx.progressed++;
      ctx.say(
        mismatch
          ? `${first(p.displayName)}: the two links may not be the same person — waiting for confirmation`
          : `${first(p.displayName)}'s profile is ready: ${synth.analysis.hobbies
              .slice(0, 3)
              .map((h) => h.label)
              .join(", ")}`,
      );
    } catch (e) {
      if (e instanceof QuotaExhaustedError) {
        ctx.notice = "The free AI quota is temporarily exhausted — the agents will resume automatically.";
        await ctx.store.updatePerson(p.id, {
          status: "waiting_quota",
          statusDetail: "Free-tier AI quota reached — resuming automatically",
        });
        return;
      }
      const attempts = p.attempts + 1;
      await ctx.store.updatePerson(p.id, {
        status: attempts >= MAX_ATTEMPTS ? "failed" : "scraped",
        attempts,
        error: errMsg(e),
      });
      ctx.say(`${first(p.displayName)}: reading failed (${errMsg(e)})`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Matchmaking                                                         */
/* ------------------------------------------------------------------ */

/** Create dates for newly profiled people (their agents "ask out" the best fits). */
export async function scheduleDates(
  pool: string,
  store: Store,
  opts: { focusIds?: string[]; k?: number },
): Promise<DateRecord[]> {
  const [people, profiles, dates] = await Promise.all([
    store.listPeople(pool),
    store.listProfiles(pool),
    store.listDates(pool),
  ]);
  const available = people.filter((p) => ["profiled", "dating", "ranked"].includes(p.status));
  const profileById = new Map(profiles.map((p) => [p.personId, p.analysis]));
  const candidates = available
    .filter((p) => profileById.has(p.id))
    .map((p) => ({ id: p.id, analysis: profileById.get(p.id)!, gender: p.gender, seeking: p.seeking }));
  const existingPairs = new Set(dates.map((d) => pairKey(d.aId, d.bId)));
  const picks = pickDates(candidates, {
    k: opts.k ?? DATES_PER_PERSON(),
    existingPairs,
    focusIds: opts.focusIds,
  });
  const mode = await chooseDateMode();
  const ts = nowIso();
  const created: DateRecord[] = picks.map((pk) => ({
    id: newId("d"),
    pool,
    aId: pk.aId,
    bId: pk.bId,
    status: "planned",
    mode,
    matchReason: pk.matchReason,
    prescore: pk.prescore,
    plan: null,
    transcript: [],
    debriefA: null,
    debriefB: null,
    models: [],
    error: null,
    createdAt: ts,
    updatedAt: ts,
  }));
  await store.insertDates(created);
  const involved = new Set(created.flatMap((d) => [d.aId, d.bId]));
  await Promise.all(
    available
      .filter((p) => involved.has(p.id))
      .map((p) =>
        store.updatePerson(p.id, { status: "dating", statusDetail: "Out on dates" }),
      ),
  );
  return created;
}

async function matchmake(ctx: Ctx, people: Person[]) {
  const fresh = people.filter((p) => p.status === "profiled");
  if (!fresh.length) return;
  const created = await scheduleDates(ctx.pool, ctx.store, { focusIds: fresh.map((p) => p.id) });
  const involved = new Set(created.flatMap((d) => [d.aId, d.bId]));
  // People whose agent found nobody compatible (e.g. alone in the pool) still get a ranking.
  for (const p of fresh) {
    if (!involved.has(p.id)) {
      await ctx.store.updatePerson(p.id, {
        status: "ranked",
        statusDetail: "Waiting for more people to join the pool",
      });
    }
  }
  if (created.length) {
    ctx.progressed += created.length;
    const names = new Map(people.map((p) => [p.id, first(p.displayName)]));
    ctx.say(
      `Matchmaker: ${created
        .slice(0, 6)
        .map((d) => `${names.get(d.aId)} asked out ${names.get(d.bId)}`)
        .join(" · ")}${created.length > 6 ? ` (+${created.length - 6} more)` : ""}`,
    );
  } else {
    await recomputeRankings(ctx.pool);
  }
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

async function advanceDate(ctx: Ctx, d: DateRecord, names: Map<string, string>) {
  const [pa, pb] = await Promise.all([ctx.store.getProfile(d.aId), ctx.store.getProfile(d.bId)]);
  if (!pa || !pb) {
    await ctx.store.updateDate(d.id, { status: "failed", error: "Missing profile" });
    return;
  }
  const a = pa.analysis;
  const b = pb.analysis;
  const an = names.get(d.aId) ?? "A";
  const bn = names.get(d.bId) ?? "B";
  const models = new Set(d.models);
  try {
    if (d.status === "planned" || !d.plan) {
      const { plan, model } = await planDate(a, b);
      models.add(model);
      await ctx.store.updateDate(d.id, { plan, status: "in_progress", models: [...models] });
      ctx.say(`${an} & ${bn}'s agents are heading to ${plan.venue} — ${plan.activity}`);
    } else if (d.status === "in_progress" && d.mode === "compact") {
      const { transcript, model } = await compactDate({ a, b, plan: d.plan });
      models.add(model);
      await ctx.store.updateDate(d.id, { transcript, status: "debriefing", models: [...models] });
      ctx.say(`${an} & ${bn} finished their date (compact mode)`);
    } else if (d.status === "in_progress") {
      const { turn, model } = await nextTurn({ date: d, a, b });
      models.add(model);
      const transcript = [...d.transcript, turn];
      const finished = transcript.length >= FULL_DATE_TURNS;
      await ctx.store.updateDate(d.id, {
        transcript,
        status: finished ? "debriefing" : "in_progress",
        models: [...models],
      });
      const who = turn.speaker === "a" ? an : bn;
      ctx.say(`${who}'s agent: “${turn.text.slice(0, 110)}${turn.text.length > 110 ? "…" : ""}”`);
    } else if (d.status === "debriefing") {
      const [ra, rb] = await Promise.all([
        d.debriefA ? Promise.resolve(null) : debrief({ date: d, self: "a", a, b }),
        d.debriefB ? Promise.resolve(null) : debrief({ date: d, self: "b", a, b }),
      ]);
      if (ra) models.add(ra.model);
      if (rb) models.add(rb.model);
      const debriefA = ra?.debrief ?? d.debriefA;
      const debriefB = rb?.debrief ?? d.debriefB;
      await ctx.store.updateDate(d.id, {
        debriefA,
        debriefB,
        status: "done",
        models: [...models],
        error: null,
      });
      const mutual = debriefA?.secondDate && debriefB?.secondDate;
      ctx.say(
        `${an} & ${bn} debriefed: ${debriefA?.chemistry}/10 and ${debriefB?.chemistry}/10${mutual ? " — it's mutual ♥" : ""}`,
      );
    }
    ctx.progressed++;
  } catch (e) {
    if (e instanceof QuotaExhaustedError) {
      ctx.notice = "The free AI quota is temporarily exhausted — dates will resume automatically.";
      return;
    }
    const errors = (Number(d.error?.match(/^\[(\d+)\]/)?.[1]) || 0) + 1;
    await ctx.store.updateDate(d.id, {
      status: errors >= MAX_DATE_ERRORS ? "failed" : d.status,
      error: `[${errors}] ${errMsg(e)}`,
    });
    ctx.say(`Date ${an} & ${bn} hit an error (${errMsg(e)})`);
  }
}

async function runDates(ctx: Ctx, people: Person[], concurrency: number): Promise<boolean> {
  const names = new Map(people.map((p) => [p.id, first(p.displayName)]));
  const visible = new Set(people.map((p) => p.id));
  let finishedAny = false;
  while (ctx.timeLeft() > 0) {
    const dates = (await ctx.store.listDates(ctx.pool)).filter(
      (d) => d.status !== "done" && d.status !== "failed" && visible.has(d.aId) && visible.has(d.bId),
    );
    if (!dates.length) break;
    const before = ctx.progressed;
    await mapLimit(dates.slice(0, concurrency * 2), concurrency, async (d) => {
      if (ctx.timeLeft() <= 0) return;
      const wasDebriefing = d.status === "debriefing";
      await advanceDate(ctx, d, names);
      if (wasDebriefing) finishedAny = true;
    });
    if (ctx.progressed === before || ctx.notice) break;
  }
  return finishedAny;
}

/* ------------------------------------------------------------------ */
/* Rankings & bookkeeping                                              */
/* ------------------------------------------------------------------ */

async function settle(ctx: Ctx, datesFinished: boolean) {
  const [people, dates] = await Promise.all([
    ctx.store.listPeople(ctx.pool),
    ctx.store.listDates(ctx.pool),
  ]);
  const pending = new Set(
    dates
      .filter((d) => d.status !== "done" && d.status !== "failed")
      .flatMap((d) => [d.aId, d.bId]),
  );
  const nowRanked = people.filter((p) => p.status === "dating" && !pending.has(p.id));
  if (datesFinished || nowRanked.length) {
    await recomputeRankings(ctx.pool);
    await Promise.all(
      nowRanked.map((p) =>
        ctx.store.updatePerson(p.id, { status: "ranked", statusDetail: "Ranking ready" }),
      ),
    );
    if (nowRanked.length) {
      ctx.progressed += nowRanked.length;
      ctx.say(`Rankings updated for ${nowRanked.map((p) => first(p.displayName)).join(", ")}`);
    }
  }
}

const ACTIVE = new Set(["queued", "scraping", "scraped", "analyzing", "profiled", "dating", "waiting_quota"]);

export async function hasPendingWork(pool: string, store: Store): Promise<boolean> {
  const [people, dates] = await Promise.all([store.listPeople(pool), store.listDates(pool)]);
  return (
    people.some((p) => ACTIVE.has(p.status)) ||
    dates.some((d) => d.status !== "done" && d.status !== "failed")
  );
}

const g = globalThis as unknown as { __adUsageStore?: Store };

/** Count LLM requests/tokens in the store so free-tier budgets hold across serverless instances. */
function countUsageInStore(store: Store) {
  if (g.__adUsageStore === store) return;
  g.__adUsageStore = store;
  setUsageCounter({ incr: (k, n) => store.incrUsage(k, n), get: (k) => store.getUsage(k) });
}

/** Advance the pool's pipeline. Safe to call concurrently (pool-level lock). */
export async function tick(pool: string, opts: TickOptions = {}): Promise<TickResult> {
  const store = await getStore(pool);
  if (store.readOnly) return { progressed: 0, pendingWork: false, notice: null, log: [] };
  countUsageInStore(store);
  const budgetMs = opts.budgetMs ?? 45_000;
  const lockName = `tick:${pool}`;
  if (!(await store.tryLock(lockName, budgetMs + 90_000))) {
    return {
      progressed: 0,
      pendingWork: true,
      notice: null,
      log: ["Another worker is already advancing the agents…"],
    };
  }
  const ctx = new Ctx(pool, store, budgetMs);
  try {
    let people = await store.listPeople(pool);
    await startQueued(ctx, people);
    people = await store.listPeople(pool);
    await pollScraping(ctx, people);
    people = await store.listPeople(pool);
    // Reading new people and advancing existing dates use different budgets, so overlap them.
    const [, finishedEarly] = await Promise.all([
      analyze(ctx, people, opts.analysisConcurrency ?? 3),
      runDates(ctx, people, opts.dateConcurrency ?? 4),
    ]);
    people = await store.listPeople(pool);
    await matchmake(ctx, people);
    people = await store.listPeople(pool);
    const finished = await runDates(ctx, people, opts.dateConcurrency ?? 4);
    await settle(ctx, finished || finishedEarly);
  } finally {
    await store.unlock(lockName);
  }
  return {
    progressed: ctx.progressed,
    pendingWork: await hasPendingWork(pool, store),
    notice: ctx.notice,
    log: ctx.log,
  };
}
