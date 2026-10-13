import type { ProfileRecord } from "@/lib/contracts";
import { compatible, computeRankings, prescore } from "@/lib/agents";
import { getStore } from "@/lib/store";
import { nowIso } from "./ids";

const RANKABLE = new Set(["profiled", "dating", "ranked"]);

/** Memoized symmetric prescore lookup (score + reasons) for a set of profiles. */
export function prescoreTable(profiles: ProfileRecord[]) {
  const byId = new Map(profiles.map((p) => [p.personId, p.analysis]));
  const cache = new Map<string, { score: number; reasons: string[] }>();
  return (a: string, b: string): { score: number; reasons: string[] } => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pa = byId.get(a);
    const pb = byId.get(b);
    const v = pa && pb ? prescore(pa, pb) : { score: 0, reasons: [] };
    cache.set(key, v);
    return v;
  };
}

/**
 * Recompute "who fits them best" for every rankable person in the pool.
 * Pure computation over stored debriefs + prescores (no LLM calls).
 */
export async function recomputeRankings(pool: string): Promise<number> {
  const store = await getStore(pool);
  if (store.readOnly) return 0;
  const [people, profiles, dates] = await Promise.all([
    store.listPeople(pool),
    store.listProfiles(pool),
    store.listDates(pool),
  ]);
  const rankable = people.filter((p) => RANKABLE.has(p.status));
  const ids = new Set(rankable.map((p) => p.id));
  const usable = dates.filter((d) => ids.has(d.aId) && ids.has(d.bId));
  const pre = prescoreTable(profiles.filter((p) => ids.has(p.personId)));
  const computedAt = nowIso();

  await Promise.all(
    rankable.map((p) =>
      store.saveRanking(pool, {
        personId: p.id,
        computedAt,
        entries: computeRankings({
          personId: p.id,
          // Only people this person would date (and who would date them back).
          candidateIds: rankable.filter((o) => o.id !== p.id && compatible(p, o)).map((o) => o.id),
          dates: usable.filter((d) => d.aId === p.id || d.bId === p.id),
          prescoreOf: (other) => pre(p.id, other).score,
          reasonsOf: (other) => pre(p.id, other).reasons,
        }),
      }),
    ),
  );
  return rankable.length;
}
