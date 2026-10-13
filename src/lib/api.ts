import { NextResponse } from "next/server";
import { DemoFloorError, NotFoundError, QuotaGuardError } from "@/lib/pipeline";
import { isPool, ReadOnlyStoreError } from "@/lib/store";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, status);

/** Resolve and validate the pool from a query param or path segment. */
export function poolOr400(pool: string | null | undefined): string | Response {
  const p = pool ?? "live";
  return isPool(p) ? p : fail(400, `Unknown pool "${p}".`);
}

/** Map domain errors to HTTP responses; anything else is a 500 with a safe message. */
export function handleError(e: unknown): Response {
  if (e instanceof ReadOnlyStoreError)
    return fail(403, "The demo is a frozen, already-run example. Try it with your own links on the live site.");
  if (e instanceof NotFoundError) return fail(404, "Not found.");
  if (e instanceof DemoFloorError) return fail(409, e.message);
  if (e instanceof QuotaGuardError) return fail(429, e.message);
  console.error(e);
  return fail(500, "Something went wrong on our side. Please try again.");
}
