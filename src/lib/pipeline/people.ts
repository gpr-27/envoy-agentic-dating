import type { Person, PersonInput } from "@/lib/contracts";
import { parsePeopleInput } from "@/lib/scrape";
import { DEMO_POOL, getMutableStore, getStore, isFrozen, ReadOnlyStoreError } from "@/lib/store";
import { nameFromSlug, newId, nowIso, uniqueSlug, utcDay } from "./ids";
import { removedIds } from "./removed";
import { recomputeRankings } from "./rankings";

export const MAX_PER_SUBMISSION = 30;
export const MAX_NEW_PEOPLE_PER_DAY = Number(process.env.MAX_NEW_PEOPLE_PER_DAY ?? 60);

export interface CreateResult {
  accepted: Array<{ id: string; slug: string; displayName: string }>;
  errors: Array<{ line: number; input: string; code: string; message: string }>;
}

export class QuotaGuardError extends Error {}

/** Validate pasted links and enqueue new people in a pool. */
export async function createPeople(
  pool: string,
  input: { text?: string; people?: PersonInput[] },
): Promise<CreateResult> {
  if (await isFrozen(pool)) throw new ReadOnlyStoreError();
  const store = await getStore(pool);
  const existing = await store.listPeople(pool, { includeHidden: true });

  const parsed = parsePeopleInput(input, {
    max: MAX_PER_SUBMISSION,
    existing: existing
      .filter((p) => !p.hidden)
      .map((p) => ({ linkedinUrl: p.linkedinUrl, instagramHandle: p.instagramHandle })),
  });
  if (!parsed.accepted.length) return { accepted: [], errors: parsed.errors };

  // Daily cap protects the free-tier quotas (Apify credit, LLM requests).
  const capKey = `cap:${pool}:${utcDay()}`;
  if (pool !== DEMO_POOL) {
    const used = await store.getUsage(capKey);
    if (used + parsed.accepted.length > MAX_NEW_PEOPLE_PER_DAY) {
      throw new QuotaGuardError(
        `Today's limit of ${MAX_NEW_PEOPLE_PER_DAY} new people for this free demo is reached. Please try again tomorrow.`,
      );
    }
  }

  const taken = new Set(existing.map((p) => p.slug));
  const ts = nowIso();
  const people: Person[] = parsed.accepted.map((a) => {
    const displayName = a.name?.trim() || nameFromSlug(a.linkedinSlug);
    const slug = uniqueSlug(a.name?.trim() || a.linkedinSlug, taken);
    taken.add(slug);
    return {
      id: newId("p"),
      pool,
      slug,
      displayName,
      linkedinUrl: a.linkedinUrl,
      instagramHandle: a.instagramHandle,
      instagramUrl: a.instagramUrl,
      photoDataUrl: null,
      gender: a.gender ?? "unspecified",
      seeking: a.seeking ?? "everyone",
      status: "queued",
      statusDetail: "Waiting for the scraper",
      error: null,
      attempts: 0,
      hidden: false,
      scrape: null,
      createdAt: ts,
      updatedAt: ts,
    };
  });
  await store.insertPeople(people);
  if (pool !== DEMO_POOL) await store.incrUsage(capKey, people.length);
  return {
    accepted: people.map((p) => ({ id: p.id, slug: p.slug, displayName: p.displayName })),
    errors: parsed.errors,
  };
}

/**
 * "Remove this person": hide them, purge their scraped data, and recompute
 * rankings so nobody ranks them any more. In the frozen demo the removal is
 * recorded in the mutable store and applied as a filter when reading.
 */
export async function removePerson(pool: string, id: string): Promise<void> {
  if (await isFrozen(pool)) {
    const snap = await getStore(pool);
    if (!(await snap.getPerson(id))) throw new NotFoundError();
    // The frozen demo must keep showing the brief's minimum of 25 people.
    const removed = await removedIds(pool);
    const visible = (await snap.listPeople(pool)).filter((p) => !removed.has(p.id)).length;
    if (!removed.has(id) && visible <= DEMO_MIN_PEOPLE) throw new DemoFloorError();
    await getMutableStore().incrUsage(`removed:${pool}:${id}`, 1);
    return;
  }
  const store = await getStore(pool);
  const p = await store.getPerson(id);
  if (!p || p.pool !== pool) throw new NotFoundError();
  await store.updatePerson(id, { hidden: true, photoDataUrl: null, statusDetail: "Removed" });
  await store.deleteSources(id);
  await store.deleteProfile(id);
  await recomputeRankings(pool);
}

/** Put a failed / quota-blocked person back into the pipeline. */
export async function retryPerson(pool: string, id: string): Promise<void> {
  const store = await getStore(pool);
  if (store.readOnly) throw new ReadOnlyStoreError();
  const p = await store.getPerson(id);
  if (!p || p.pool !== pool || p.hidden) throw new NotFoundError();
  const hasSources = Boolean(await store.getSources(id));
  const hasProfile = Boolean(await store.getProfile(id));
  await store.updatePerson(id, {
    status: hasProfile ? "profiled" : hasSources ? "scraped" : "queued",
    statusDetail: "Retrying",
    error: null,
    attempts: 0,
    scrape: null,
  });
}

/** User override after an identity_mismatch flag: treat the two links as one person. */
export async function confirmIdentity(pool: string, id: string): Promise<void> {
  const store = await getStore(pool);
  if (store.readOnly) throw new ReadOnlyStoreError();
  const p = await store.getPerson(id);
  if (!p || p.pool !== pool || p.hidden) throw new NotFoundError();
  if (p.status !== "identity_mismatch") return;
  await store.updatePerson(id, {
    status: "profiled",
    statusDetail: "Identity confirmed by a visitor",
    error: null,
  });
}

/** Minimum people the frozen demo keeps visible (the brief asks for at least 25). */
export const DEMO_MIN_PEOPLE = 25;

export class DemoFloorError extends Error {
  constructor() {
    super(
      `The finished demo has to keep at least ${DEMO_MIN_PEOPLE} people. Contact the site owner to remove someone from the demo.`,
    );
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
  }
}
