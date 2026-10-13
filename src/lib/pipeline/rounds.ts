import { getStore, ReadOnlyStoreError } from "@/lib/store";
import { scheduleDates } from "./tick";

/**
 * "Send the agents on another round of dates": every agent asks out its next
 * best compatible candidates it hasn't dated yet.
 */
export async function startRound(pool: string): Promise<number> {
  const store = await getStore(pool);
  if (store.readOnly) throw new ReadOnlyStoreError();
  const created = await scheduleDates(pool, store, { k: 1 });
  return created.length;
}
