import { handleError, json, poolOr400 } from "@/lib/api";
import { poolStatus } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const pool = poolOr400(new URL(req.url).searchParams.get("pool"));
  if (pool instanceof Response) return pool;
  try {
    return json(await poolStatus(pool));
  } catch (e) {
    return handleError(e);
  }
}
