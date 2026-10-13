import { json } from "@/lib/api";
import { getMutableStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Health + keepalive. A scheduled GitHub Action and the daily Vercel cron hit
 * this so the free Supabase project never pauses for inactivity.
 */
export async function GET() {
  const t = Date.now();
  const store = getMutableStore();
  try {
    await store.getUsage("health");
    return json({ ok: true, store: store.kind, dbMs: Date.now() - t });
  } catch (e) {
    return json({ ok: false, store: store.kind, error: (e as Error).message }, 503);
  }
}
