/**
 * Compact, labelled rendering of the two (and only two) sources: LinkedIn
 * and Instagram. Every item gets a stable ref label ("post 3",
 * "experience 2") that the agents cite as evidence. Scraped text is
 * sanitised so it cannot close or forge the wrapper tags.
 */
import type { NormalizedInstagram, NormalizedLinkedIn, ScrapeBundle } from "@/lib/contracts";

/** Max data images sent to vision models. */
export const MAX_IMAGES = 4;
const MAX_POSTS = 12;

/** Collapse whitespace, neutralise wrapper tags, truncate. */
export function clean(text: string | null | undefined, max = 400): string {
  if (!text) return "";
  let s = String(text)
    .replace(/<\/?\s*(linkedin_profile|instagram_profile|identity_signals|[a-z_]*pitch|[a-z_]*profile)[^>]*>/gi, "[tag removed]")
    .replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

function line(label: string, value: string): string {
  return value ? `${label}: ${value}` : "";
}

function list(items: string[], maxItems: number, maxLen = 60): string {
  return items
    .slice(0, maxItems)
    .map((s) => clean(s, maxLen))
    .filter(Boolean)
    .join(", ");
}

/** LinkedIn rendered inside `<linkedin_profile>` with item refs. */
export function formatLinkedIn(li: NormalizedLinkedIn): string {
  const rows: string[] = [
    line("name", clean(li.fullName, 80)),
    line("headline", clean(li.headline, 220)),
    line("location", clean(li.location, 80)),
    line("followers", li.followers != null ? String(li.followers) : ""),
    line("about", clean(li.about, 1400)),
  ];
  if (li.experience.length) {
    rows.push("experience (most recent first):");
    li.experience.slice(0, 8).forEach((e, i) => {
      const meta = [clean(e.dateRange, 40), clean(e.location, 50)].filter(Boolean).join(", ");
      const desc = clean(e.description, i < 3 ? 260 : 140);
      rows.push(`  [experience ${i + 1}] ${clean(e.title, 90)} @ ${clean(e.company, 70)}${meta ? ` (${meta})` : ""}${desc ? `: ${desc}` : ""}`);
    });
  }
  if (li.education.length) {
    rows.push("education:");
    li.education.slice(0, 4).forEach((e, i) => {
      const bits = [clean(e.degree, 90), clean(e.dateRange, 30)].filter(Boolean).join(", ");
      rows.push(`  [education ${i + 1}] ${clean(e.school, 90)}${bits ? ` (${bits})` : ""}`);
    });
  }
  rows.push(line("skills", list(li.skills, 25, 40)));
  rows.push(line("languages", list(li.languages, 8, 30)));
  rows.push(line("certifications", list(li.certifications, 8, 80)));
  rows.push(line("volunteering", list(li.volunteering, 6, 100)));
  rows.push(line("honors", list(li.honors, 6, 100)));
  if (li.activity.length) {
    rows.push("activity (recent public posts/reactions):");
    li.activity.slice(0, 5).forEach((a, i) => rows.push(`  [activity ${i + 1}] "${clean(a, 220)}"`));
  }
  return `<linkedin_profile url="${clean(li.url, 200)}">\n${rows.filter(Boolean).join("\n")}\n</linkedin_profile>`;
}

/** Instagram rendered inside `<instagram_profile>` with post refs. */
export function formatInstagram(ig: NormalizedInstagram): string {
  const stats = [
    ig.followers != null ? `${ig.followers} followers` : "",
    ig.following != null ? `${ig.following} following` : "",
    ig.postsCount != null ? `${ig.postsCount} posts` : "",
    ig.isVerified ? "verified" : "",
    ig.isBusiness ? "business account" : "",
    ig.category ? `category ${clean(ig.category, 40)}` : "",
  ].filter(Boolean);
  const rows: string[] = [
    `handle: @${clean(ig.handle, 40)}`,
    line("name", clean(ig.fullName, 80)),
    line("bio", clean(ig.biography, 300)),
    line("links", ig.externalUrls.slice(0, 4).map((u) => clean(u, 120)).join(" , ")),
    line("stats", stats.join(" · ")),
  ];
  const posts = ig.posts.slice(0, MAX_POSTS);
  if (posts.length) {
    rows.push(`posts (${posts.length} most recent, newest first):`);
    posts.forEach((p, i) => {
      const meta = [
        p.timestamp ? p.timestamp.slice(0, 10) : "",
        p.location ? `at ${clean(p.location, 60)}` : "",
        p.type && p.type !== "Image" ? clean(p.type, 12) : "",
        p.likes != null ? `${p.likes} likes` : "",
      ].filter(Boolean);
      rows.push(`  [post ${i + 1}] ${meta.join(" · ")}${p.url ? ` · url: ${clean(p.url, 120)}` : ""}`);
      if (p.caption) rows.push(`    caption: "${clean(p.caption, 280)}"`);
      if (p.hashtags.length) rows.push(`    hashtags: ${p.hashtags.slice(0, 10).map((h) => `#${clean(h, 30).replace(/^#/, "")}`).join(" ")}`);
      if (p.alt) rows.push(`    alt: "${clean(p.alt, 140)}"`);
    });
  } else {
    rows.push("posts: none visible");
  }
  return `<instagram_profile url="${clean(ig.url, 200)}">\n${rows.filter(Boolean).join("\n")}\n</instagram_profile>`;
}

/** Up to MAX_IMAGES captured images (posts first, avatar last) with their labels. */
export function pickImages(bundle: ScrapeBundle): { dataUrls: string[]; labels: string[] } {
  const postIndex = new Map(bundle.instagram.posts.slice(0, MAX_POSTS).map((p, i) => [p.id, i + 1]));
  const posts = bundle.images.filter((im) => postIndex.has(im.postId));
  const avatar = bundle.images.filter((im) => im.postId === "profile");
  const chosen = [...posts.slice(0, avatar.length ? MAX_IMAGES - 1 : MAX_IMAGES), ...avatar.slice(0, 1)];
  return {
    dataUrls: chosen.map((c) => c.dataUrl),
    labels: chosen.map((c, i) => `image ${i + 1} = ${c.postId === "profile" ? "Instagram profile photo" : `photo from post ${postIndex.get(c.postId)}`}`),
  };
}

/** Normalised name tokens (for identity checks). */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Deterministic identity signals computed in code (given to the model as hints). */
export interface IdentitySignals {
  linkedinName: string;
  instagramName: string;
  nameOverlap: "full" | "partial" | "none" | "unknown";
  instagramLinksToLinkedIn: boolean;
  handleResemblesName: boolean;
  locations: { linkedin: string; instagram: string[] };
}

/** Compute identity signals between the two profiles. */
export function identitySignals(bundle: ScrapeBundle): IdentitySignals {
  const li = bundle.linkedin;
  const ig = bundle.instagram;
  const a = nameTokens(li.fullName);
  const b = nameTokens(ig.fullName);
  let nameOverlap: IdentitySignals["nameOverlap"] = "unknown";
  if (a.length && b.length) {
    const shared = a.filter((t) => b.includes(t)).length;
    nameOverlap = shared === 0 ? "none" : shared >= Math.min(a.length, b.length) ? "full" : "partial";
  }
  const slug = li.url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? "";
  const linksToLi = ig.externalUrls.some((u) => /linkedin\.com\/in\//i.test(u) && (!slug || u.toLowerCase().includes(slug)));
  const handle = ig.handle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const handleResemblesName = a.some((t) => t.length >= 3 && handle.includes(t));
  const igLocations = [...new Set(ig.posts.map((p) => p.location).filter((l): l is string => Boolean(l)))].slice(0, 5);
  return {
    linkedinName: li.fullName,
    instagramName: ig.fullName,
    nameOverlap,
    instagramLinksToLinkedIn: linksToLi,
    handleResemblesName,
    locations: { linkedin: li.location, instagram: igLocations },
  };
}

/** Render identity signals as a compact block. */
export function formatIdentitySignals(s: IdentitySignals): string {
  return [
    "<identity_signals>",
    `linkedin name: ${clean(s.linkedinName, 80) || "(none)"} | instagram name: ${clean(s.instagramName, 80) || "(none)"} | name overlap: ${s.nameOverlap}`,
    `instagram bio links to this linkedin profile: ${s.instagramLinksToLinkedIn ? "yes" : "no"} | handle resembles name: ${s.handleResemblesName ? "yes" : "no"}`,
    `linkedin location: ${clean(s.locations.linkedin, 60) || "(none)"} | instagram post locations: ${s.locations.instagram.map((l) => clean(l, 40)).join("; ") || "(none)"}`,
    "</identity_signals>",
  ].join("\n");
}

/** First name for conversational use. */
export function firstName(displayName: string): string {
  const t = displayName.trim().split(/\s+/)[0];
  return t || displayName || "them";
}
