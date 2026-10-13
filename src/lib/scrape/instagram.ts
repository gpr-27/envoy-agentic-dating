/**
 * Instagram actor adapter for `apify/instagram-profile-scraper`.
 *
 * Verified input schema (api.apify.com/v2/acts/apify~instagram-profile-scraper/builds/default):
 * `{ usernames: string[] (required), includeAboutSection?: boolean (paid only) }`.
 * There is no posts-limit input: the actor returns ≤12 `latestPosts` per profile, and
 * we also cap at 12 during normalisation. Cost is capped with run option `maxItems`.
 */
import type { CanonicalLinks, NormalizedInstagram } from "@/lib/contracts";
import type { StartOptions } from "./apify";
import { instagramItemError, instagramItemHandle, normalizeInstagram } from "./normalize-instagram";
import { asObj } from "./util";

/** Builds the actor input for a batch of handles. */
export function instagramActorInput(links: CanonicalLinks[]): Record<string, unknown> {
  return { usernames: links.map((l) => l.instagramHandle), includeAboutSection: false };
}

/** Run sizing: dataset item cap (pay-per-result) and a batch-scaled timeout. */
export function instagramRunOptions(count: number): StartOptions {
  return {
    memory: 1024,
    timeout: Math.min(1800, 180 + count * 20),
    maxItems: count,
    // Hard spend cap per run ($0.0026/profile on the free plan, with headroom).
    maxTotalChargeUsd: Math.round((0.01 + count * 0.004) * 1000) / 1000,
  };
}

/** Per-link outcome of an Instagram run. */
export type InstagramOutcome = { instagram: NormalizedInstagram | null; error?: string };

/** Maps dataset items to links by username (case-insensitive) or input URL. */
export function matchInstagramItems(items: unknown[], links: CanonicalLinks[], actor: string): Map<string, InstagramOutcome> {
  const out = new Map<string, InstagramOutcome>();
  const wanted = new Set(links.map((l) => l.instagramHandle));
  for (const raw of items) {
    const o = asObj(raw);
    const handle = instagramItemHandle(o);
    if (!handle || !wanted.has(handle)) continue;
    const err = instagramItemError(o);
    if (err) {
      if (!out.has(handle)) out.set(handle, { instagram: null, error: err });
      continue;
    }
    if (out.get(handle)?.instagram) continue;
    out.set(handle, { instagram: normalizeInstagram(o, actor, handle) });
  }
  for (const l of links) if (!out.has(l.instagramHandle)) out.set(l.instagramHandle, { instagram: null, error: "not_found" });
  return out;
}
