import type { PoolStatus } from "@/lib/contracts";
import { getStore, isFrozen } from "@/lib/store";
import { removedIds } from "./removed";
import { hasPendingWork } from "./tick";

/** Lightweight status payload the UI polls while the pipeline runs. */
export async function poolStatus(pool: string): Promise<PoolStatus> {
  const store = await getStore(pool);
  const removed = await removedIds(pool);
  const [people, dates, frozen] = await Promise.all([
    store.listPeople(pool),
    store.listDates(pool),
    isFrozen(pool),
  ]);
  const visible = people.filter((p) => !removed.has(p.id));
  const counts: Record<string, number> = {};
  for (const p of visible) counts[p.status] = (counts[p.status] ?? 0) + 1;
  const ids = new Set(visible.map((p) => p.id));
  const live = dates.filter((d) => ids.has(d.aId) && ids.has(d.bId));
  return {
    pool,
    frozen,
    counts,
    people: visible.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      status: p.status,
      statusDetail: p.statusDetail,
      error: p.error,
      photoDataUrl: p.photoDataUrl,
    })),
    dates: {
      total: live.length,
      done: live.filter((d) => d.status === "done").length,
      inProgress: live.filter((d) => d.status !== "done" && d.status !== "failed").length,
    },
    pendingWork: frozen ? false : await hasPendingWork(pool, store),
    notice: null,
  };
}
