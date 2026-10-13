/**
 * Freezes the local "demo" pool into src/data/demo-snapshot.json, which the
 * deployed app serves read-only at /pool/demo (no database needed).
 *
 *   npx tsx scripts/export-demo.ts
 */
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";

process.loadEnvFile?.(path.join(process.cwd(), ".env.local"));
process.env.SUPABASE_URL = "";
process.env.DEMO_FROM_STORE = "1";

async function main() {
  const { getMutableStore, DEMO_POOL } = await import("../src/lib/store");
  const { recomputeRankings } = await import("../src/lib/pipeline");
  const store = getMutableStore();
  await recomputeRankings(DEMO_POOL);
  const all = await store.listPeople(DEMO_POOL);
  // The frozen demo shows the finished example: only people who were read, dated and ranked.
  const people = all.filter((p) => p.status === "ranked");
  const ranked = people;
  const sources: Record<string, unknown> = {};
  for (const p of people) {
    const s = await store.getSources(p.id);
    if (s) sources[p.id] = s;
  }
  const snapshot = {
    pool: DEMO_POOL,
    exportedAt: new Date().toISOString(),
    people,
    sources,
    profiles: await store.listProfiles(DEMO_POOL),
    dates: (await store.listDates(DEMO_POOL)).filter((d) => d.status === "done"),
    rankings: await store.listRankings(DEMO_POOL),
  };
  if (ranked.length < 25 && !process.argv.includes("--allow-small")) {
    throw new Error(`Only ${ranked.length} people are ranked — the brief needs at least 25. Let the seed finish.`);
  }
  const file = path.join(process.cwd(), "src/data/demo-snapshot.json");
  writeFileSync(file, JSON.stringify(snapshot));
  const mb = (statSync(file).size / 1024 / 1024).toFixed(2);
  console.log(
    `Exported ${people.length} people (${ranked.length} ranked), ${snapshot.profiles.length} profiles, ` +
      `${snapshot.dates.length} dates, ${snapshot.rankings.length} rankings → ${file} (${mb} MB)`,
  );
  const notRanked = all.filter((p) => p.status !== "ranked");
  if (notRanked.length) {
    console.log("Not ranked:", notRanked.map((p) => `${p.displayName} [${p.status}] ${p.error ?? ""}`).join("\n  "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
