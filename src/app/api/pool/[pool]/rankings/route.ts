import { handleError, json, poolOr400 } from "@/lib/api";
import { recomputeRankings } from "@/lib/pipeline";
import { getStore, ReadOnlyStoreError } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Recompute every person's ranking from the stored debriefs and prescores. */
export async function POST(_req: Request, ctx: RouteContext<"/api/pool/[pool]/rankings">) {
  const pool = poolOr400((await ctx.params).pool);
  if (pool instanceof Response) return pool;
  try {
    if ((await getStore(pool)).readOnly) throw new ReadOnlyStoreError();
    const people = await recomputeRankings(pool);
    return json({ ok: true, people });
  } catch (e) {
    return handleError(e);
  }
}
