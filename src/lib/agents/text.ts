/** Tiny deterministic text utilities for the matchmaker (no LLM). */

const STOP = new Set(
  "a an and are as at be been but by can do does for from has have he her him his how i if in into is it its just like me more most my no not of on or our out over she so some such than that the their them then there these they this those to too up us very was we were what when where which who why will with would you your someone somebody partner person people who'll they'll loves love enjoys enjoy likes really also often always never every many much lot lots one two three thing things way ways being get gets got make makes made inferred posts post profile shows seems likely probably clearly".split(
    " ",
  ),
);

/** Very light stemmer: strips common English suffixes so "climbing" ~ "climber" ~ "climb". */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ["ingly", "ings", "ing", "ers", "er", "ies", "es", "ed", "ly", "s"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return suf === "ies" ? `${w.slice(0, -3)}y` : w.slice(0, -suf.length);
  }
  return w;
}

/** Lowercased, stop-word-free, stemmed tokens. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map(stem);
}

/** Token set of several strings. */
export function tokenSet(...texts: string[]): Set<string> {
  const s = new Set<string>();
  for (const t of texts) for (const tok of tokens(t)) s.add(tok);
  return s;
}

/** Jaccard similarity; null when both sets are empty (component skipped). */
export function jaccard(a: Set<string>, b: Set<string>): number | null {
  if (!a.size && !b.size) return null;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Intersection as a sorted array. */
export function intersect(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => b.has(x)).sort();
}

/** Fraction of `need` tokens present in `offer` (null when need is empty). */
export function coverage(need: Set<string>, offer: Set<string>): number | null {
  if (!need.size) return null;
  let hit = 0;
  for (const x of need) if (offer.has(x)) hit++;
  return hit / need.size;
}

/** 32-bit FNV-1a hash (deterministic variety). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
