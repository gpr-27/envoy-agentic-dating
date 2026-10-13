import { createHash } from "node:crypto";
import { getMutableStore } from "@/lib/store";

/** Salted hash so raw visitor IPs are never stored. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "agentic-dating";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 24);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

/**
 * Fixed-window rate limit backed by the usage counter.
 * Returns true when the request is allowed.
 */
export async function allow(
  req: Request,
  bucket: string,
  limit: number,
  windowSec: number,
  opts: { peek?: boolean } = {},
): Promise<boolean> {
  const window = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${bucket}:${hashIp(clientIp(req))}:${window}`;
  try {
    const store = getMutableStore();
    // peek: check without counting (count later, only if the request succeeds).
    if (opts.peek) return (await store.getUsage(key)) < limit;
    const n = await store.incrUsage(key, 1);
    return n <= limit;
  } catch {
    return true; // fail open: availability over strictness for a demo
  }
}
