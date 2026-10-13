import { fail, handleError, json, poolOr400 } from "@/lib/api";
import { tick } from "@/lib/pipeline";
import { allow } from "@/lib/security/ratelimit";
import { isFrozen } from "@/lib/store";

export const dynamic = "force-dynamic";
// Vercel Hobby allows up to 300s; each tick stops starting new steps well before that.
export const maxDuration = 300;

const BUDGET_MS = Number(process.env.TICK_BUDGET_MS ?? 40_000);

/** Advance the agents' work (scrape → read → date → rank) by one time slice. */
export async function POST(req: Request) {
  const pool = poolOr400(new URL(req.url).searchParams.get("pool"));
  if (pool instanceof Response) return pool;
  if (await isFrozen(pool)) {
    return json({ progressed: 0, pendingWork: false, notice: null, log: [] });
  }
  if (!(await allow(req, "tick", 40, 60))) return fail(429, "Slow down a little.");
  try {
    return json(await tick(pool, { budgetMs: BUDGET_MS }));
  } catch (e) {
    return handleError(e);
  }
}
