import { fail, handleError, json, poolOr400 } from "@/lib/api";
import { allow } from "@/lib/security/ratelimit";
import { removePerson } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/** "Remove this person": hide, purge scraped data, recompute rankings. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/people/[id]">) {
  const { id } = await ctx.params;
  const pool = poolOr400(new URL(req.url).searchParams.get("pool"));
  if (pool instanceof Response) return pool;
  if (!(await allow(req, "remove", 5, 3600))) {
    return fail(429, "Too many removals from you in the last hour.");
  }
  try {
    await removePerson(pool, id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
