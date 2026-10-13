import { randomUUID } from "node:crypto";

export const newId = (prefix: "p" | "d") => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 14)}`;

export const nowIso = () => new Date().toISOString();

/** "jeff-su-1a2b" → "Jeff Su" (best-effort until the real name is scraped). */
export function nameFromSlug(slug: string): string {
  const words = decodeURIComponent(slug)
    .split(/[-_.]+/)
    .filter((w) => w && !/\d/.test(w) && !/^[a-f0-9]{6,}$/i.test(w));
  if (!words.length) return slug;
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "person"
  );
}

/** Unique slug within a pool given the slugs already taken. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base);
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const s = `${root}-${i}`;
    if (!taken.has(s)) return s;
  }
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
