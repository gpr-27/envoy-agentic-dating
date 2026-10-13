/**
 * Small, dependency-free helpers for reading untyped actor output safely.
 * Actor datasets are `unknown` JSON; these helpers never throw.
 */

/** A plain JSON object. */
export type Obj = Record<string, unknown>;

/** True for non-null, non-array objects. */
export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns `v` as an object, or an empty object. */
export function asObj(v: unknown): Obj {
  return isObj(v) ? v : {};
}

/** Returns `v` as an array, or an empty array. */
export function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Returns a trimmed string for strings/numbers, otherwise "". */
export function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** First non-empty string among the given keys of `o`. Supports dotted paths. */
export function pickStr(o: Obj, ...keys: string[]): string {
  for (const k of keys) {
    const v = str(getPath(o, k));
    if (v) return v;
  }
  return "";
}

/** First defined (non-null/undefined) value among the given keys. Supports dotted paths. */
export function pickVal(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = getPath(o, k);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

/** First array among the given keys (empty array if none). */
export function pickArr(o: Obj, ...keys: string[]): unknown[] {
  for (const k of keys) {
    const v = getPath(o, k);
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

/** Parses a count: numbers, numeric strings, "1,234", "12.5K", "3M". Negative → null. */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const m = v.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([kmb])?\+?/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

/** First parseable count among the given keys. */
export function pickNum(o: Obj, ...keys: string[]): number | null {
  for (const k of keys) {
    const n = num(getPath(o, k));
    if (n !== null) return n;
  }
  return null;
}

/** Reads a boolean (true/false/"true"/"false"); undefined if absent. */
export function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

/** Reads `a.b.c` from an object. */
export function getPath(o: Obj, path: string): unknown {
  let cur: unknown = o;
  for (const part of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** Truncates to `max` characters on a word boundary when possible, adding an ellipsis. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.7 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Order-preserving de-duplication (case-insensitive for strings). */
export function uniq(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (!it || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/** Deterministic 32-bit FNV-1a hash (used for mock data and fake run ids). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Converts light HTML (e.g. bovi's `<br>` descriptions) to plain text. */
export function htmlToText(s: string): string {
  if (!s || !/<[a-z!/][^>]*>|&[a-z#0-9]+;/i.test(s)) return s;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (ENTITIES[k]) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
