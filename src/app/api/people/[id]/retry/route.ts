import { handleError, json, poolOr400 } from "@/lib/api";
import { retryPerson } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/people/[id]/retry">) {
  const { id } = await ctx.params;
  const pool = poolOr400(new URL(req.url).searchParams.get("pool"));
  if (pool instanceof Response) return pool;
  try {
    await retryPerson(pool, id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
