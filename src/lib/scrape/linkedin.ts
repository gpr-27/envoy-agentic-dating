/**
 * LinkedIn actor adapters: build the actor-specific input, size the run, and
 * map dataset items back to the submitted links.
 *
 * Verified input schemas (api.apify.com/v2/acts/<actor>/builds/default → inputSchema):
 * - harvestapi/linkedin-profile-scraper (primary): `{ urls?: string[], queries?, publicIdentifiers?, profileIds?,
 *   profileScraperMode: "Profile details no email ($4 per 1k)" | "Profile details + email search ($10 per 1k)" }`.
 *   We send ONLY `urls` (sending `queries` too duplicates every profile) and always the no-email mode.
 * - bovi/linkedin-profile-scraper (fallback): `{ profileUrls: string[], maxProfiles?, proxyConfiguration?, disableUsageStats? }`
 * - supreme_coder/linkedin-profile-scraper (supported, unused: returned 0 items in a real run):
 *   `{ urls: [{ url }], scrapeCompany?, findContacts? }`
 */
import type { CanonicalLinks, NormalizedLinkedIn } from "@/lib/contracts";
import type { StartOptions } from "./apify";
import { linkedInParseMeta, normalizeLinkedIn, type LinkedInParseMeta } from "./normalize-linkedin";
import { canonicalizeLinkedIn } from "./urls";
import { asArr, asObj, isObj, pickStr, str, type Obj } from "./util";

/** Which input shape an actor expects. */
export type LinkedInInputStyle = "harvestapi" | "urls_objects" | "profile_urls";

/** harvestapi mode that never runs (or pays for) email search. */
export const HARVESTAPI_NO_EMAIL_MODE = "Profile details no email ($4 per 1k)";

/** Detects the input style from the actor id (`user/name` or `user~name`). */
export function linkedInInputStyle(actor: string): LinkedInInputStyle {
  if (/(^|[/~])bovi[/~]/i.test(actor)) return "profile_urls";
  if (/(^|[/~])harvestapi[/~]/i.test(actor)) return "harvestapi";
  return "urls_objects";
}

/** Builds the actor input for a batch of profiles. Contact finding / company scraping are always off. */
export function linkedInActorInput(actor: string, links: CanonicalLinks[]): Record<string, unknown> {
  const urls = links.map((l) => `${l.linkedinUrl}/`);
  const style = linkedInInputStyle(actor);
  if (style === "harvestapi") return { urls: links.map((l) => l.linkedinUrl), profileScraperMode: HARVESTAPI_NO_EMAIL_MODE };
  if (style === "profile_urls") {
    return { profileUrls: urls, maxProfiles: links.length, disableUsageStats: true };
  }
  return { urls: urls.map((url) => ({ url })), scrapeCompany: false, findContacts: false };
}

/** Run sizing: modest memory, a timeout that scales with batch size, and a hard cost cap. */
export function linkedInRunOptions(actor: string, count: number): StartOptions {
  const style = linkedInInputStyle(actor);
  return {
    memory: style === "profile_urls" ? 1024 : 512,
    timeout: Math.min(1800, 120 + count * 30),
    maxItems: count,
    // Pay-per-event cap: $0.004/profile (harvestapi, no-email), $0.0039 (bovi), $0.005 (supreme_coder) + start fees.
    maxTotalChargeUsd: Math.round((0.02 + count * 0.008) * 1000) / 1000,
  };
}

/** Per-link outcome of a LinkedIn run. */
export type LinkedInOutcome = { linkedin: NormalizedLinkedIn | null; error?: string; meta?: LinkedInParseMeta };

const PRIORITY_KEYS = ["inputUrl", "input_url", "input", "originalQuery", "originalUrl", "query", "requestUrl", "searchUrl"];

/** All LinkedIn slugs an item mentions, input-echo fields first. */
export function linkedInItemSlugs(o: Obj): string[] {
  const found: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string") {
      const c = canonicalizeLinkedIn(v);
      if (c.ok) found.push(c.slug);
    } else if (isObj(v)) {
      const u = pickStr(v, "url", "profileUrl", "query");
      if (u) add(u);
    }
  };
  for (const k of PRIORITY_KEYS) add(o[k]);
  for (const [k, v] of Object.entries(o)) {
    if (PRIORITY_KEYS.includes(k)) continue;
    if (typeof v === "string" && /linkedin\.com\/(?:mwlite\/)?in\//i.test(v)) add(v);
    else if (Array.isArray(v) && /url|same_as|sameAs/i.test(k)) asArr(v).forEach(add);
  }
  const id = pickStr(o, "publicIdentifier", "public_identifier", "slug", "vanityName");
  if (id) found.push(id.toLowerCase());
  return [...new Set(found)];
}

/** An item that is only an error stub (no profile data). */
export function linkedInItemError(o: Obj): string | null {
  const hasData = Boolean(pickStr(o, "fullName", "full_name", "name", "firstName", "first_name", "headline"));
  const e = pickStr(o, "error", "errorMessage", "error_message", "#error");
  if (hasData) return null;
  if (e) return /not.?found|404|does not exist|unavailable/i.test(e) ? "not_found" : e;
  return o["#debug"] !== undefined || o["#error"] !== undefined ? "not_found" : "empty_item";
}

/**
 * Maps dataset items to links by slug (input echo, profile URL, public identifier).
 * If exactly one link and one item remain unmatched, they are paired.
 * Links without a usable item get `error: "not_found"` (or the item's error).
 */
export function matchLinkedInItems(items: unknown[], links: CanonicalLinks[], actor: string): Map<string, LinkedInOutcome> {
  const bySlug = new Map<string, LinkedInOutcome>();
  const wanted = new Set(links.map((l) => l.linkedinSlug));
  const unmatched: Obj[] = [];
  for (const raw of items) {
    const o = asObj(raw);
    const slug = linkedInItemSlugs(o).find((s) => wanted.has(s));
    if (!slug) {
      unmatched.push(o);
      continue;
    }
    const prev = bySlug.get(slug);
    if (prev?.linkedin) continue; // keep the first good item
    bySlug.set(slug, outcomeFor(o, actor, links.find((l) => l.linkedinSlug === slug)!));
  }
  const missing = links.filter((l) => !bySlug.has(l.linkedinSlug));
  if (missing.length === 1 && unmatched.length === 1) bySlug.set(missing[0].linkedinSlug, outcomeFor(unmatched[0], actor, missing[0]));
  for (const l of links) if (!bySlug.has(l.linkedinSlug)) bySlug.set(l.linkedinSlug, { linkedin: null, error: "not_found" });
  return bySlug;
}

function outcomeFor(o: Obj, actor: string, link: CanonicalLinks): LinkedInOutcome {
  const err = linkedInItemError(o);
  if (err) return { linkedin: null, error: err === "empty_item" ? "not_found" : err };
  const linkedin = normalizeLinkedIn(o, actor, link.linkedinUrl);
  // Always report the canonical URL the user submitted.
  linkedin.url = link.linkedinUrl;
  const meta = linkedInParseMeta(o);
  return meta.parseConfidence !== null || meta.warnings.length ? { linkedin, meta } : { linkedin };
}

/** Exposed for diagnostics: the raw text of an item's first URL-ish field. */
export function linkedInItemLabel(o: Obj): string {
  return pickStr(o, "inputUrl", "profile_url", "url", "linkedinUrl") || str(o.name) || "(unknown item)";
}
