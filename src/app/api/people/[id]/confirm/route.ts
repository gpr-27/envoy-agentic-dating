import { handleError, json, poolOr400 } from "@/lib/api";
import { confirmIdentity } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/** Override an identity_mismatch flag: the two links are the same person. */
export async function POST(req: Request, ctx: RouteContext<"/api/people/[id]/confirm">) {
  const { id } = await ctx.params;
  const pool = poolOr400(new URL(req.url).searchParams.get("pool"));
  if (pool instanceof Response) return pool;
  try {
    await confirmIdentity(pool, id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
