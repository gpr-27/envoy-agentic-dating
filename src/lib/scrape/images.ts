/**
 * Captures images at scrape time (Instagram CDN URLs expire): the profile picture
 * as a small avatar and up to 4 post images, downsized and stored as data URLs.
 */
import sharp from "sharp";
import type { CapturedImage, NormalizedInstagram } from "@/lib/contracts";
import { isMockMode } from "./config";
import { hash32 } from "./util";

/** Options for {@link captureImages}. */
export type CaptureOptions = {
  /** Max post images (default 4). */
  maxPosts?: number;
  /** Per-image timeout in ms (default 10000). */
  timeoutMs?: number;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
};

const MAX_BYTES = 12 * 1024 * 1024;

async function download(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Buffer | null> {
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; agentic-dating/1.0)", accept: "image/*" },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length && buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}

const toDataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString("base64")}`;

/** Resizes to a 160×160 JPEG (q75) avatar. Returns null on decode failure. */
export async function toAvatarDataUrl(input: Buffer): Promise<string | null> {
  try {
    const out = await sharp(input).rotate().resize(160, 160, { fit: "cover" }).jpeg({ quality: 75 }).toBuffer();
    return toDataUrl(out);
  } catch {
    return null;
  }
}

/** Resizes so the longest side is ≤512px (never enlarges), JPEG q70. Returns null on failure. */
export async function toPostDataUrl(input: Buffer): Promise<string | null> {
  try {
    const out = await sharp(input)
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return toDataUrl(out);
  } catch {
    return null;
  }
}

const PALETTE = ["#E76F51", "#2A9D8F", "#E9C46A", "#264653", "#F4A261", "#8E7DBE", "#3D5A80", "#C05299", "#4F772D", "#D62828"];

function initials(name: string, fallback: string): string {
  const words = (name || fallback).replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const chars = words.slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "");
  return chars.join("") || "?";
}

/** SVG avatar (initials on a colour derived from the seed) as a data URL. */
export function svgAvatarDataUrl(name: string, seed: string): string {
  const bg = PALETTE[hash32(seed) % PALETTE.length];
  const text = initials(name, seed).replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="${bg}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="64" font-weight="600" fill="#fff">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Downloads and downsizes the profile picture (postId "profile") and up to
 * `maxPosts` post images. Failures are skipped silently; never throws.
 * Mock mode: SVG initials avatar, no post images.
 */
export async function captureImages(
  ig: NormalizedInstagram,
  opts: CaptureOptions = {},
): Promise<{ images: CapturedImage[]; photoDataUrl: string | null }> {
  try {
    if (isMockMode()) return { images: [], photoDataUrl: svgAvatarDataUrl(ig.fullName, ig.handle) };
    const fetchImpl = opts.fetchImpl ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const maxPosts = Math.max(0, Math.min(opts.maxPosts ?? 4, 12));

    const avatarJob = ig.profilePicUrl
      ? download(ig.profilePicUrl, fetchImpl, timeoutMs).then((b) => (b ? toAvatarDataUrl(b) : null))
      : Promise.resolve(null);
    const candidates = ig.posts.filter((p) => p.imageUrl).slice(0, maxPosts * 2 + 2); // slack for failures
    const postJobs = candidates.map(async (p) => {
      const b = await download(p.imageUrl!, fetchImpl, timeoutMs);
      const dataUrl = b ? await toPostDataUrl(b) : null;
      return dataUrl ? { postId: p.id, dataUrl } : null;
    });
    const [avatar, ...posts] = await Promise.all([avatarJob, ...postJobs]);
    const images: CapturedImage[] = [];
    if (typeof avatar === "string") images.push({ postId: "profile", dataUrl: avatar });
    for (const p of posts) if (p && typeof p === "object" && images.length - (avatar ? 1 : 0) < maxPosts) images.push(p);
    return { images, photoDataUrl: typeof avatar === "string" ? avatar : null };
  } catch {
    return { images: [], photoDataUrl: null };
  }
}
