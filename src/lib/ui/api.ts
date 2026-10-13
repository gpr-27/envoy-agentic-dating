/** Tiny client-side JSON fetch wrapper that never throws. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data: Record<string, unknown> | null };

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection and try again.", data: null };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const obj = (body && typeof body === "object" ? body : null) as Record<string, unknown> | null;
  const msg =
    (obj && typeof obj.error === "string" && obj.error) ||
    (res.status === 429
      ? "Too many requests right now. Wait a minute and try again."
      : res.status === 403
        ? "This pool is read-only."
        : `Request failed (${res.status}).`);
  return { ok: false, status: res.status, error: msg, data: obj };
}
