/**
 * Copies the frozen demo snapshot into the LIVE pool of the configured store
 * (Supabase in production), so people that graders paste in have 25+ agents
 * to date from the first minute. IDs are re-keyed to stay unique.
 *
 *   npx tsx scripts/import-live.ts           # idempotent: skips if live pool has people
 *   npx tsx scripts/import-live.ts --force   # import even if not empty
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Snapshot } from "../src/lib/store/types";

process.loadEnvFile?.(path.join(process.cwd(), ".env.local"));

async function main() {
  const { getMutableStore, LIVE_POOL } = await import("../src/lib/store");
  const store = getMutableStore();
  console.log(`Target store: ${store.kind}`);
  const snap = JSON.parse(
    readFileSync(path.join(process.cwd(), "src/data/demo-snapshot.json"), "utf8"),
  ) as Snapshot & { sample?: boolean };
  if (snap.sample) throw new Error("Snapshot is still the fictional sample. Seed + export first.");

  const existing = await store.listPeople(LIVE_POOL, { includeHidden: true });
  if (existing.length && !process.argv.includes("--force")) {
    console.log(`Live pool already has ${existing.length} people — nothing to do.`);
    return;
  }
  const taken = new Set(existing.map((p) => p.slug));
  const key = (id: string) => `l${id}`;
  const people = snap.people
    .filter((p) => !p.hidden && !taken.has(p.slug))
    .map((p) => ({ ...p, id: key(p.id), pool: LIVE_POOL }));
  const ids = new Set(people.map((p) => p.id));
  await store.insertPeople(people);
  for (const p of snap.people) {
    if (!ids.has(key(p.id))) continue;
    const s = snap.sources[p.id];
    if (s) await store.saveSources(key(p.id), LIVE_POOL, s);
  }
  for (const pr of snap.profiles) {
    if (ids.has(key(pr.personId))) await store.saveProfile(LIVE_POOL, { ...pr, personId: key(pr.personId) });
  }
  await store.insertDates(
    snap.dates
      .filter((d) => ids.has(key(d.aId)) && ids.has(key(d.bId)))
      .map((d) => ({ ...d, id: key(d.id), pool: LIVE_POOL, aId: key(d.aId), bId: key(d.bId) })),
  );
  for (const r of snap.rankings) {
    if (!ids.has(key(r.personId))) continue;
    await store.saveRanking(LIVE_POOL, {
      ...r,
      personId: key(r.personId),
      entries: r.entries
        .filter((e) => ids.has(key(e.personId)))
        .map((e) => ({ ...e, personId: key(e.personId), dateId: e.dateId ? key(e.dateId) : null })),
    });
  }
  if ("flush" in store) await (store as { flush: () => Promise<void> }).flush();
  console.log(`Imported ${people.length} people into the live pool.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
