/**
 * Turning raw model text into validated data: strip fences, extract the
 * JSON object, coerce obviously-safe type slips, then zod-validate.
 */
import type { z } from "zod";

/** Remove ```json fences / leading prose and return the JSON-looking part. */
export function extractJsonText(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (end >= 0 && end < s.length - 1) s = s.slice(0, end + 1);
  return s;
}

/** Parse model text as JSON; throws SyntaxError with a short message. */
export function parseJsonLoose(raw: string): unknown {
  const text = extractJsonText(raw);
  if (!text) throw new SyntaxError("empty response");
  try {
    return JSON.parse(text);
  } catch {
    // Common slip: trailing commas.
    return JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
  }
}

type PathKey = string | number;

function getAt(root: unknown, path: readonly PathKey[]): { parent: Record<string | number, unknown> | null; key: PathKey | null; value: unknown } {
  let parent: Record<string | number, unknown> | null = null;
  let key: PathKey | null = null;
  let cur: unknown = root;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return { parent: null, key: null, value: undefined };
    parent = cur as Record<string | number, unknown>;
    key = k;
    cur = parent[k as string];
  }
  return { parent, key, value: cur };
}

/**
 * zod-validate with a light, safe coercion pre-pass driven by the issues:
 * numeric strings → numbers, "true"/"false" → booleans, null for a
 * required-but-defaulted field → removed (so the default applies),
 * single value where an array is expected → wrapped.
 */
export function validateWithCoercion<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const value: unknown = input;
  for (let pass = 0; pass < 4; pass++) {
    const res = schema.safeParse(value);
    if (res.success) return { ok: true, data: res.data };
    let changed = false;
    for (const issue of res.error.issues) {
      if (issue.code !== "invalid_type") continue;
      const { parent, key, value: v } = getAt(value, issue.path as PathKey[]);
      if (!parent || key === null) continue;
      const expected = (issue as { expected?: string }).expected;
      if (expected === "number" && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.trim()))) {
        parent[key] = Number(v.trim());
        changed = true;
      } else if (expected === "boolean" && typeof v === "string" && /^(true|false)$/i.test(v.trim())) {
        parent[key] = v.trim().toLowerCase() === "true";
        changed = true;
      } else if (expected === "array" && (typeof v === "string" || (typeof v === "object" && v !== null && !Array.isArray(v)))) {
        parent[key] = [v];
        changed = true;
      } else if (v === null) {
        delete parent[key];
        changed = true;
      }
    }
    if (!changed) return { ok: false, error: formatIssues(res.error.issues) };
  }
  const res = schema.safeParse(value);
  return res.success ? { ok: true, data: res.data } : { ok: false, error: formatIssues(res.error.issues) };
}

function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 8)
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
