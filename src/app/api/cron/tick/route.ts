import { fail, json } from "@/lib/api";
import { tick } from "@/lib/pipeline";
import { LIVE_POOL } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily Vercel cron: advances any pipeline work nobody is watching (e.g. a
 * visitor closed the tab mid-date) and doubles as a database keepalive.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Fail closed: without a configured secret nobody can trigger the cron.
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return fail(401, "Unauthorized");
  }
  const res = await tick(LIVE_POOL, { budgetMs: 240_000 });
  return json(res);
}
