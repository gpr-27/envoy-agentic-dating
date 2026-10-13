/**
 * Runs the full agent pipeline for the people in data/people.csv into the
 * "demo" pool of the LOCAL file store (.data/db.json). Resumable: re-running
 * continues where it stopped. Afterwards run `npm run export` to freeze it.
 *
 *   npx tsx scripts/seed-demo.ts [--limit 30] [--k 3]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

process.loadEnvFile?.(path.join(process.cwd(), ".env.local"));
// The demo is built locally, then frozen into the snapshot.
process.env.SUPABASE_URL = "";
process.env.DEMO_FROM_STORE = "1";

const arg = (name: string, dflt: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};

async function main() {
  const limit = arg("limit", 30);
  process.env.DATES_PER_PERSON = String(arg("k", Number(process.env.DATES_PER_PERSON ?? 3)));

  const { getMutableStore, DEMO_POOL } = await import("../src/lib/store");
  const { createPeople, tick } = await import("../src/lib/pipeline");
  const { setUsageCounter } = await import("../src/lib/llm");
  const store = getMutableStore();
  setUsageCounter({ incr: (k, n) => store.incrUsage(k, n), get: (k) => store.getUsage(k) });

  const existing = await store.listPeople(DEMO_POOL);
  if (!existing.length) {
    const csv = readFileSync(path.join(process.cwd(), "data/people.csv"), "utf8");
    const lines = csv.trim().split("\n");
    const text = [lines[0], ...lines.slice(1, limit + 1)].join("\n");
    const res = await createPeople(DEMO_POOL, { text });
    console.log(`Enqueued ${res.accepted.length} people; ${res.errors.length} errors`);
    for (const e of res.errors) console.log(`  line ${e.line}: ${e.code} ${e.message}`);
  } else {
    console.log(`Resuming: ${existing.length} people already in the demo pool`);
  }

  let round = 0;
  for (;;) {
    round++;
    const t0 = Date.now();
    const r = await tick(DEMO_POOL, {
      budgetMs: arg("budget", 150) * 1000,
      analysisConcurrency: 4,
      dateConcurrency: arg("dc", 10),
    });
    for (const line of r.log) console.log(`  ${line}`);
    const people = await store.listPeople(DEMO_POOL);
    const counts: Record<string, number> = {};
    for (const p of people) counts[p.status] = (counts[p.status] ?? 0) + 1;
    const dates = await store.listDates(DEMO_POOL);
    console.log(
      `[round ${round}] ${Math.round((Date.now() - t0) / 1000)}s progressed=${r.progressed} ` +
        `people=${JSON.stringify(counts)} dates=${dates.filter((d) => d.status === "done").length}/${dates.length}` +
        (r.notice ? ` NOTICE: ${r.notice}` : ""),
    );
    if ("flush" in store) await (store as { flush: () => Promise<void> }).flush();
    if (!r.pendingWork) break;
    if (r.progressed === 0) await new Promise((res) => setTimeout(res, r.notice ? 60_000 : 8_000));
  }
  console.log("Demo pool complete. Next: npm run export");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
