/**
 * Link canonicalisation for the two official sources: a personal LinkedIn
 * profile and a (public) Instagram profile.
 */
import type { LinkErrorCode } from "@/lib/contracts";

/** Failed canonicalisation with a human-friendly message. */
export type LinkError = { ok: false; code: LinkErrorCode; message: string };
/** Result of {@link canonicalizeLinkedIn}. */
export type LinkedInResult = { ok: true; url: string; slug: string } | LinkError;
/** Result of {@link canonicalizeInstagram}. */
export type InstagramResult = { ok: true; handle: string; url: string } | LinkError;

const LI_EXAMPLE = "linkedin.com/in/jane-doe";
const IG_EXAMPLE = "instagram.com/jane.doe";

const LI_NOT_PERSON: Record<string, string> = {
  company: "That's a LinkedIn company page",
  school: "That's a LinkedIn school page",
  showcase: "That's a LinkedIn showcase page",
  feed: "That's a link to a LinkedIn feed",
  posts: "That's a link to a LinkedIn post",
  pulse: "That's a link to a LinkedIn article",
  groups: "That's a LinkedIn group",
  jobs: "That's a LinkedIn job listing",
  events: "That's a LinkedIn event",
  newsletters: "That's a LinkedIn newsletter",
  learning: "That's a LinkedIn Learning page",
  search: "That's a LinkedIn search page",
  sales: "That's a LinkedIn Sales Navigator page",
  hashtag: "That's a LinkedIn hashtag page",
  services: "That's a LinkedIn services page",
};

const IG_NOT_PROFILE: Record<string, string> = {
  p: "That's a link to an Instagram post",
  reel: "That's a link to an Instagram reel",
  reels: "That's a link to Instagram reels",
  tv: "That's a link to an Instagram video",
  stories: "That's a link to an Instagram story",
  explore: "That's an Instagram explore/tag page",
  accounts: "That's an Instagram account-settings page",
  direct: "That's an Instagram DM link",
  about: "That's an Instagram help page",
  legal: "That's an Instagram legal page",
  developer: "That's an Instagram developer page",
  web: "That's not an Instagram profile",
  s: "That's a link to an Instagram highlight",
  "challenge": "That's not an Instagram profile",
};

const IG_HANDLE_RE = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9._]{1,30}$/;

function err(code: LinkErrorCode, message: string): LinkError {
  return { ok: false, code, message };
}

/** Removes wrapping quotes/brackets/markdown that people paste around links. */
function cleanInput(input: string): string {
  let s = (input ?? "").trim();
  const md = s.match(/^\[[^\]]*\]\((.+)\)$/); // [text](url)
  if (md) s = md[1];
  return s.replace(/^[<"'`(\s]+|[>"'`)\s,;]+$/g, "").trim();
}

/** Parses a host-ish string into a URL, adding https:// when missing. */
function toUrl(s: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function pathSegments(u: URL): string[] {
  return u.pathname.split("/").filter(Boolean).map(safeDecode);
}

/**
 * Canonicalises a LinkedIn personal-profile link to `https://www.linkedin.com/in/<slug>`.
 * Accepts missing scheme, www./m./locale subdomains, query/fragment, trailing slash and
 * URL-encoded slugs. Rejects short links, company/school/showcase/feed/post pages and
 * legacy `/pub/` URLs with friendly messages.
 */
export function canonicalizeLinkedIn(input: string): LinkedInResult {
  const s = cleanInput(input);
  if (!s) return err("linkedin_empty", `Add the person's LinkedIn profile link, like ${LI_EXAMPLE}.`);
  const u = toUrl(s);
  if (!u) {
    return err("linkedin_not_url", `That doesn't look like a link — paste the full LinkedIn profile URL, like ${LI_EXAMPLE}.`);
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "lnkd.in" || host.endsWith(".lnkd.in")) {
    return err(
      "linkedin_shortlink",
      `That's a LinkedIn short link (lnkd.in) — open it and paste the full profile URL instead, like ${LI_EXAMPLE}.`,
    );
  }
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) {
    return err("linkedin_not_url", `That isn't a LinkedIn link — we need a personal profile like ${LI_EXAMPLE}.`);
  }
  let segs = pathSegments(u);
  if (segs[0]?.toLowerCase() === "mwlite") segs = segs.slice(1); // LinkedIn Lite
  const kind = (segs[0] ?? "").toLowerCase();
  if (kind === "pub") {
    return err(
      "linkedin_legacy_url",
      `That's an old-style LinkedIn link (/pub/). Open it and copy the current profile URL, like ${LI_EXAMPLE}.`,
    );
  }
  if (kind !== "in") {
    const what = LI_NOT_PERSON[kind] ?? "That's not a LinkedIn personal profile";
    return err("linkedin_not_person", `${what} — we need a personal profile like ${LI_EXAMPLE}.`);
  }
  const slug = (segs[1] ?? "").trim().toLowerCase().normalize("NFC");
  if (!slug || /[\s/?#]/.test(slug) || slug.length < 2 || slug.length > 100) {
    return err("linkedin_not_person", `That LinkedIn link is missing the profile name — it should look like ${LI_EXAMPLE}.`);
  }
  return { ok: true, slug, url: `https://www.linkedin.com/in/${slug}` };
}

/**
 * Canonicalises an Instagram profile reference (`@handle`, bare handle, or URL on
 * instagram.com / instagr.am) to a lowercase handle and `https://www.instagram.com/<handle>/`.
 * Rejects post/reel/story/explore links and invalid handles.
 */
export function canonicalizeInstagram(input: string): InstagramResult {
  const s = cleanInput(input);
  if (!s) return err("instagram_empty", `Add the person's Instagram — a handle like @jane.doe or a link like ${IG_EXAMPLE}.`);
  let handle: string;
  const looksLikeUrl = /[/:]/.test(s) || /^(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\b/i.test(s);
  if (s.startsWith("@")) {
    handle = s.slice(1);
  } else if (looksLikeUrl) {
    const u = toUrl(s);
    if (!u) return err("instagram_invalid_handle", `That doesn't look like an Instagram link — try a handle like @jane.doe.`);
    const host = u.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
    if (host !== "instagram.com" && host !== "instagr.am") {
      const isLinkedIn = /(^|\.)linkedin\.com$|^lnkd\.in$/.test(host);
      return err(
        "instagram_not_profile",
        isLinkedIn
          ? `That's a LinkedIn link in the Instagram slot — we need an Instagram profile like ${IG_EXAMPLE}.`
          : `That isn't an Instagram link — we need a profile like ${IG_EXAMPLE}.`,
      );
    }
    let segs = pathSegments(u);
    if (segs[0] === "_u" || segs[0] === "_n") segs = segs.slice(1); // app deep links
    const first = (segs[0] ?? "").toLowerCase();
    if (!first) return err("instagram_not_profile", `That Instagram link has no profile in it — use one like ${IG_EXAMPLE}.`);
    if (first in IG_NOT_PROFILE || (segs.length >= 2 && ["p", "reel", "tv"].includes((segs[1] ?? "").toLowerCase()))) {
      const what = IG_NOT_PROFILE[first] ?? IG_NOT_PROFILE[(segs[1] ?? "").toLowerCase()] ?? "That's not an Instagram profile";
      return err("instagram_not_profile", `${what} — we need the profile itself, like ${IG_EXAMPLE}.`);
    }
    handle = segs[0];
  } else {
    handle = s;
  }
  handle = handle.trim().toLowerCase();
  if (!IG_HANDLE_RE.test(handle)) {
    return err(
      "instagram_invalid_handle",
      `"${handle.slice(0, 40)}" isn't a valid Instagram handle — handles use 1–30 letters, numbers, periods or underscores (e.g. @jane.doe).`,
    );
  }
  return { ok: true, handle, url: `https://www.instagram.com/${handle}/` };
}

/** Cheap check: does this token look like a LinkedIn link (any kind)? */
export function looksLikeLinkedIn(token: string): boolean {
  return /(^|[/.@\s])(?:[a-z]{2,3}\.)?linkedin\.com|(^|\/\/|\b)lnkd\.in\b/i.test(token);
}

/** Cheap check: does this token look like an Instagram reference? */
export function looksLikeInstagram(token: string): boolean {
  return /^@/.test(token.trim()) || /instagram\.com|instagr\.am/i.test(token);
}
