import { fail, handleError, json, poolOr400 } from "@/lib/api";
import { startRound } from "@/lib/pipeline";
import { allow } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";

/** Send every agent on one more date with its next-best unmet candidate. */
export async function POST(req: Request, ctx: RouteContext<"/api/pool/[pool]/round">) {
  const pool = poolOr400((await ctx.params).pool);
  if (pool instanceof Response) return pool;
  if (!(await allow(req, "round", 3, 600))) {
    return fail(429, "A dating round was just started — let the agents finish those dates first.");
  }
  try {
    const created = await startRound(pool);
    return json({ created });
  } catch (e) {
    return handleError(e);
  }
}
