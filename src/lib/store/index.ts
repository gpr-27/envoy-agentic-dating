import { FileStore } from "./file-store";
import { SnapshotStore } from "./snapshot-store";
import { SupabaseStore } from "./supabase-store";
import type { Snapshot, Store } from "./types";

export type { Store, Snapshot } from "./types";
export { ReadOnlyStoreError } from "./types";

/** The frozen, already-run example pool (served from the bundled snapshot). */
export const DEMO_POOL = "demo";
/** The pool graders paste their own links into. */
export const LIVE_POOL = "live";
export const POOLS = [DEMO_POOL, LIVE_POOL] as const;

export function isPool(p: string): p is (typeof POOLS)[number] {
  return (POOLS as readonly string[]).includes(p);
}

// Process-wide singletons: Next.js may instantiate this module once per route
// bundle, and every copy must share one store (the file store caches in memory).
const g = globalThis as unknown as { __adStore?: Store | null };
let snapshot: SnapshotStore | null | undefined;

/** Writable store: Supabase when configured, else the local JSON file store. */
export function getMutableStore(): Store {
  if (g.__adStore) return g.__adStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  g.__adStore = url && key ? new SupabaseStore(url, key) : new FileStore();
  return g.__adStore;
}

/** Test hook. */
export function setMutableStore(store: Store | null) {
  g.__adStore = store;
}

async function loadSnapshot(): Promise<SnapshotStore | null> {
  if (snapshot !== undefined) return snapshot;
  try {
    const mod = (await import("@/data/demo-snapshot.json")) as unknown as {
      default: Snapshot;
    };
    const snap = mod.default;
    snapshot = snap?.people?.length ? new SnapshotStore(snap) : null;
  } catch {
    snapshot = null;
  }
  return snapshot;
}

/**
 * Store for a pool. The demo pool reads from the frozen snapshot when one has
 * been exported (DEMO_FROM_STORE=1 forces the mutable store, used while seeding).
 */
export async function getStore(pool: string): Promise<Store> {
  if (pool === DEMO_POOL && process.env.DEMO_FROM_STORE !== "1") {
    const snap = await loadSnapshot();
    if (snap) return snap;
  }
  return getMutableStore();
}

/** Whether a pool accepts writes from visitors. */
export async function isFrozen(pool: string): Promise<boolean> {
  if (pool !== DEMO_POOL) return false;
  return process.env.DEMO_FROM_STORE !== "1";
}
