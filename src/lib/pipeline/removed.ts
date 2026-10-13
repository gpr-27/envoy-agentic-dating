import { getMutableStore, isFrozen } from "@/lib/store";

/**
 * People removed from a frozen pool. The snapshot itself can't change, so
 * removals are recorded in the mutable store and filtered out on read. If the
 * database is unreachable the demo still renders (fail open on availability).
 */
export async function removedIds(pool: string): Promise<Set<string>> {
  if (!(await isFrozen(pool))) return new Set();
  try {
    const prefix = `removed:${pool}:`;
    const rows = await getMutableStore().listUsage(prefix);
    return new Set(rows.filter((r) => r.count > 0).map((r) => r.key.slice(prefix.length)));
  } catch {
    return new Set();
  }
}
