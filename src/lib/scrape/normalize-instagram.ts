/**
 * Tolerant mapping from an `apify/instagram-profile-scraper` item (or similar
 * Instagram actors) to {@link NormalizedInstagram}. Contact fields
 * (businessEmail, businessPhoneNumber, businessAddress, ...) are never mapped,
 * and all free text is PII-scrubbed.
 */
import { NormalizedInstagram } from "@/lib/contracts";
import { isContactLink, scrubText } from "./pii";
import { canonicalizeInstagram } from "./urls";
import { asArr, asObj, bool, clip, pickArr, pickNum, pickStr, pickVal, str, uniq, type Obj } from "./util";

/** Text limits applied during normalisation. */
export const IG_LIMITS = { biography: 2500, caption: 600, maxPosts: 12, alt: 300 } as const;

type Post = NormalizedInstagram["posts"][number];

const HASHTAG_RE = /#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /(?:^|[^\w.])@([A-Za-z0-9._]{1,30})/g;

/** Extracts #hashtags (without '#') from text. */
export function extractHashtags(text: string): string[] {
  return uniq([...text.matchAll(HASHTAG_RE)].map((m) => m[1]));
}

/** Extracts @mentions (without '@') from text, trimming trailing periods. */
export function extractMentions(text: string): string[] {
  return uniq([...text.matchAll(MENTION_RE)].map((m) => cleanTag(m[1])).filter(Boolean));
}

function cleanTag(s: string): string {
  return s
    .trim()
    .replace(/^[#@]/, "")
    .replace(/[’'][a-z]{0,2}$/iu, "") // "NASAUniverse’s" → "NASAUniverse"
    .replace(/[.,!?;:"”)]+$/u, ""); // "NASAGoddard." → "NASAGoddard"
}

function postType(v: string): string {
  const s = v.toLowerCase();
  if (s.includes("sidecar") || s.includes("carousel") || s === "8") return "Sidecar";
  if (s.includes("video") || s.includes("reel") || s.includes("clip") || s === "2") return "Video";
  return "Image";
}

/** Converts "https://l.instagram.com/?u=<encoded>&e=..." shims to the real URL. */
function unshim(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)l\.instagram\.com$/.test(u.hostname)) return u.searchParams.get("u") ?? url;
  } catch {
    /* not a URL */
  }
  return url;
}

function externalUrlsOf(o: Obj): string[] {
  const list: string[] = [];
  for (const e of asArr(pickVal(o, "externalUrls", "bioLinks", "bio_links"))) {
    const u = typeof e === "string" ? e : pickStr(asObj(e), "url", "lynx_url", "link");
    if (u) list.push(unshim(u));
  }
  const single = pickStr(o, "externalUrl", "external_url", "website") || unshim(pickStr(o, "externalUrlShimmed"));
  if (single) list.unshift(single);
  return uniq(list.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u) && !isContactLink(u))).slice(0, 10);
}

function timestampOf(p: Obj): string | null {
  const v = pickVal(p, "timestamp", "takenAt", "taken_at_timestamp", "taken_at", "date");
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const s = str(v);
  return s || null;
}

function mapPost(raw: unknown, idx: number): Post | null {
  const p = asObj(raw);
  const shortCode = pickStr(p, "shortCode", "shortcode", "code");
  const id = pickStr(p, "id", "pk") || shortCode || `post-${idx + 1}`;
  const rawCaption = pickStr(p, "caption", "text", "edge_media_to_caption.edges.0.node.text", "caption.text");
  const caption = clip(scrubText(rawCaption), IG_LIMITS.caption);
  const providedTags = asArr(p.hashtags).map((h) => cleanTag(str(h))).filter(Boolean);
  const providedMentions = asArr(p.mentions).map((m) => cleanTag(str(m))).filter(Boolean);
  const likes = pickNum(p, "likesCount", "likes", "like_count", "edge_liked_by.count");
  const loc = pickVal(p, "locationName", "location_name", "location");
  const location = typeof loc === "string" ? loc.trim() || null : pickStr(asObj(loc), "name") || null;
  const imageUrl =
    pickStr(p, "displayUrl", "display_url", "imageUrl", "thumbnailUrl", "thumbnail_src") || str(asArr(p.images)[0]) || null;
  const alt = pickStr(p, "alt", "accessibility_caption", "accessibilityCaption");
  return {
    id,
    url: pickStr(p, "url", "postUrl") || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : ""),
    type: postType(pickStr(p, "type", "productType", "media_type", "__typename") || "Image"),
    caption,
    hashtags: uniq(providedTags.length ? providedTags : extractHashtags(rawCaption)).slice(0, 30),
    mentions: uniq(providedMentions.length ? providedMentions : extractMentions(rawCaption)).slice(0, 30),
    location: location ? clip(location, 120) : null,
    timestamp: timestampOf(p),
    likes,
    comments: pickNum(p, "commentsCount", "comments", "comment_count", "edge_media_to_comment.count"),
    imageUrl,
    alt: alt ? clip(scrubText(alt), IG_LIMITS.alt) : null,
  };
}

/** The (lowercased) handle an Instagram item refers to, or "" if unknown. */
export function instagramItemHandle(o: Obj): string {
  const u = pickStr(o, "username", "userName", "handle");
  if (u) return u.toLowerCase().replace(/^@/, "");
  for (const k of ["inputUrl", "url", "profileUrl", "input"]) {
    const v = str(o[k]);
    if (!v) continue;
    const c = canonicalizeInstagram(v);
    if (c.ok) return c.handle;
  }
  return "";
}

/**
 * Normalises one raw Instagram profile item. Never throws. Private accounts keep
 * `isPrivate: true` and no posts (the pipeline rejects them).
 */
export function normalizeInstagram(raw: unknown, actor: string, fallbackHandle = ""): NormalizedInstagram {
  const o = asObj(raw);
  const handle = instagramItemHandle(o) || fallbackHandle.toLowerCase();
  const isPrivate = bool(pickVal(o, "private", "isPrivate", "is_private")) ?? false;
  const posts = isPrivate
    ? []
    : pickArr(o, "latestPosts", "posts", "latest_posts")
        .map(mapPost)
        .filter((p): p is Post => p !== null)
        .slice(0, IG_LIMITS.maxPosts);
  return NormalizedInstagram.parse({
    handle,
    url: handle ? `https://www.instagram.com/${handle}/` : "",
    fullName: clip(scrubText(pickStr(o, "fullName", "full_name", "name")), 120),
    biography: clip(scrubText(pickStr(o, "biography", "bio", "description")), IG_LIMITS.biography),
    externalUrls: externalUrlsOf(o),
    followers: pickNum(o, "followersCount", "followers", "follower_count", "edge_followed_by.count"),
    following: pickNum(o, "followsCount", "following", "following_count", "edge_follow.count"),
    postsCount: pickNum(o, "postsCount", "mediaCount", "media_count", "edge_owner_to_timeline_media.count"),
    isPrivate,
    isVerified: bool(pickVal(o, "verified", "isVerified", "is_verified")) ?? false,
    isBusiness: bool(pickVal(o, "isBusinessAccount", "is_business_account", "isBusiness")) ?? false,
    category: pickStr(o, "businessCategoryName", "business_category_name", "category_name", "categoryName", "category") || null,
    profilePicUrl: pickStr(o, "profilePicUrlHD", "profilePicUrl", "profile_pic_url_hd", "profile_pic_url") || null,
    posts,
    actor,
  });
}

/** True when an Instagram dataset item is an error stub (e.g. `{ error: "not_found" }`). */
export function instagramItemError(o: Obj): string | null {
  const e = pickStr(o, "error", "errorCode");
  if (!e) return null;
  if (pickStr(o, "username", "id") && (o.followersCount !== undefined || o.biography !== undefined)) return null;
  return /not.?found|does not exist|no such/i.test(`${e} ${pickStr(o, "errorDescription")}`) ? "not_found" : e;
}
