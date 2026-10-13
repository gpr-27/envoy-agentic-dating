/** Offline mock outputs for the Reader agent (read + synthesize). */
import { HOBBIES, INTERESTS, QUALITY_CUES } from "./lexicon";
import { parseSources, type ParsedPost, type ParsedSources } from "./parse";

type Ev = { source: "linkedin" | "instagram"; ref: string; quote: string; url: string | null };

const cut = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (s: string, n = 12) => s.split(/\s+/).slice(0, n).join(" ");

function postText(p: ParsedPost): string {
  return `${p.caption} ${p.hashtags.join(" ")} ${p.location}`;
}

function postEv(p: ParsedPost): Ev {
  return { source: "instagram", ref: `post ${p.n}`, quote: words(p.caption || p.hashtags.map((h) => `#${h}`).join(" ") || p.location, 12), url: p.url };
}

function liEv(s: ParsedSources, ref: string, quote: string): Ev {
  return { source: "linkedin", ref, quote: words(quote, 12), url: s.li.url || null };
}

function displayName(s: ParsedSources): string {
  return s.li.name || s.ig.name || s.ig.handle || "This person";
}

/** Hobbies found in Instagram posts (and the LinkedIn About as a fallback). */
function hobbyHits(s: ParsedSources) {
  const hits: { label: string; need: string; posts: ParsedPost[]; about: boolean }[] = [];
  for (const h of HOBBIES) {
    const posts = s.ig.posts.filter((p) => h.re.test(postText(p)));
    const about = h.re.test(`${s.li.about} ${s.ig.bio}`);
    if (posts.length || about) hits.push({ label: h.label, need: h.need, posts, about });
  }
  return hits.sort((a, b) => b.posts.length - a.posts.length).slice(0, 5);
}

function liText(s: ParsedSources): string {
  return [s.li.headline, s.li.about, ...s.li.experience.map((e) => `${e.title} ${e.company} ${e.desc}`), s.li.skills.join(" "), s.li.volunteering].join(" ");
}

/** Mock reading log. */
export function mockRead(prompt: string): unknown {
  const s = parseSources(prompt);
  const name = displayName(s).split(" ")[0];
  const steps: { source: string; looked_at: string; observation: string; evidence: Ev[] }[] = [];
  if (s.li.headline || s.li.about) {
    steps.push({
      source: "linkedin",
      looked_at: "The headline and About section",
      observation: `I start with how ${name} introduces themself: "${cut(s.li.headline || s.li.about, 90)}". That's the version of ${name} meant for colleagues.`,
      evidence: [liEv(s, s.li.headline ? "headline" : "about", s.li.headline || s.li.about)],
    });
  }
  if (s.li.experience.length) {
    const e = s.li.experience[0];
    steps.push({
      source: "linkedin",
      looked_at: `Experience (${s.li.experience.length} roles)`,
      observation: `The current chapter is ${e.title} at ${e.company}${s.li.experience.length > 1 ? `, after ${s.li.experience.length - 1} earlier role(s)` : ""}. I read that as someone who stays with things long enough to build them.`,
      evidence: [liEv(s, `experience ${e.n}`, `${e.title} @ ${e.company}`)],
    });
  }
  if (s.li.skills.length) {
    steps.push({ source: "linkedin", looked_at: "Skills", observation: `The skills list leans ${s.li.skills.slice(0, 3).join(", ")}: practical, not padded.`, evidence: [liEv(s, "skills", s.li.skills.slice(0, 4).join(", "))] });
  }
  if (s.ig.bio) {
    steps.push({ source: "instagram", looked_at: "The Instagram bio", observation: `Over on Instagram the tone shifts: "${cut(s.ig.bio, 80)}".`, evidence: [{ source: "instagram", ref: "bio", quote: words(s.ig.bio), url: s.ig.url || null }] });
  }
  for (const h of hobbyHits(s).slice(0, 3)) {
    if (!h.posts.length) continue;
    const refs = h.posts.slice(0, 3).map((p) => p.n);
    steps.push({
      source: "instagram",
      looked_at: `Posts ${refs.join(", ")}`,
      observation: `${h.posts.length} of the ${s.ig.posts.length} posts are about ${h.label.toLowerCase()}. That's a habit, not a one-off.`,
      evidence: h.posts.slice(0, 2).map(postEv),
    });
  }
  const locs = [...new Set(s.ig.posts.map((p) => p.location).filter(Boolean))];
  if (locs.length) {
    const p = s.ig.posts.find((x) => x.location === locs[0])!;
    steps.push({ source: "instagram", looked_at: "Post locations", observation: `Tagged places include ${locs.slice(0, 3).join(", ")}, so I can picture where the weekends go.`, evidence: [postEv(p)] });
  }
  if (s.ig.posts.length) {
    const avg = s.ig.posts.reduce((n, p) => n + p.caption.length, 0) / s.ig.posts.length;
    steps.push({
      source: "instagram",
      looked_at: "How the captions are written",
      observation: avg < 40 ? `Captions are short, often a few words. ${name} lets the photos do the talking.` : `Captions run long and chatty; ${name} likes to tell the story behind a photo.`,
      evidence: [postEv(s.ig.posts[0])],
    });
  } else {
    steps.push({ source: "instagram", looked_at: "The posts", observation: "There are no posts I can see, so I'm going on very little here and I'll keep my conclusions modest.", evidence: [{ source: "instagram", ref: "stats", quote: "no posts visible", url: s.ig.url || null }] });
  }
  steps.push({
    source: "both",
    looked_at: "Cross-checking the two profiles",
    observation: s.identity.linked ? "The Instagram bio links straight to this LinkedIn, so these are clearly the same person." : s.identity.nameOverlap === "none" ? "The names on the two profiles don't match and nothing links them. I'm not sure these are the same person." : "Names line up across both profiles; nothing contradicts that it's one person.",
    evidence: [liEv(s, "headline", s.li.name || s.li.headline), { source: "instagram", ref: "bio", quote: words(s.ig.name || s.ig.handle), url: s.ig.url || null }],
  });
  const hobbies = hobbyHits(s).map((h) => h.label.toLowerCase());
  return {
    steps: steps.slice(0, 10),
    firstImpression: `${name} reads as ${s.li.headline ? `a ${cut(s.li.headline, 60).toLowerCase()}` : "someone"} whose off-hours go to ${hobbies.slice(0, 2).join(" and ") || "things they don't post much about"}. ${s.ig.posts.length < 3 ? "There isn't much to go on, so treat this as a sketch." : "The two profiles tell a consistent story."} They'd likely suit someone who meets them on their own turf.`,
  };
}

/** Mock profile analysis. */
export function mockSynthesize(prompt: string): unknown {
  const s = parseSources(prompt);
  const name = displayName(s);
  const first = name.split(" ")[0];
  const all = `${liText(s)} ${s.ig.bio} ${s.ig.posts.map(postText).join(" ")}`;
  const anchorEv: Ev = s.li.headline ? liEv(s, "headline", s.li.headline) : s.ig.bio ? { source: "instagram", ref: "bio", quote: words(s.ig.bio), url: s.ig.url || null } : liEv(s, "about", s.li.about || name);

  const hits = hobbyHits(s);
  const hobbies = hits.map((h) => ({
    label: h.label,
    detail: h.posts.length ? `Shows up in ${h.posts.length} of ${s.ig.posts.length} recent posts.` : `Mentioned in their own words.`,
    evidence: h.posts.length ? h.posts.slice(0, 2).map(postEv) : [liEv(s, "about", s.li.about || s.ig.bio)],
    confidence: h.posts.length >= 3 ? "high" : h.posts.length ? "medium" : "low",
  }));
  if (!hobbies.length) hobbies.push({ label: "Their work", detail: "Not much outside work is visible; their craft seems to be the main hobby.", evidence: [anchorEv], confidence: "low" });

  const interests = INTERESTS.filter((i) => i.re.test(liText(s)))
    .slice(0, 4)
    .map((i) => {
      const exp = s.li.experience.find((e) => i.re.test(`${e.title} ${e.company} ${e.desc}`));
      return { label: i.label, detail: `Runs through their LinkedIn${exp ? `, e.g. ${exp.title} @ ${exp.company}` : ""}.`, evidence: [exp ? liEv(s, `experience ${exp.n}`, `${exp.title} @ ${exp.company}`) : anchorEv], confidence: exp ? "high" : "medium" };
    });
  if (!interests.length) interests.push({ label: cut(s.li.headline || "Their field", 40), detail: "Their professional world, as stated in the headline.", evidence: [anchorEv], confidence: "low" });

  const qualities = QUALITY_CUES.filter(([re]) => re.test(all)).map(([re, category, label, detail]) => {
    const p = s.ig.posts.find((x) => re.test(postText(x)));
    const e = s.li.experience.find((x) => re.test(`${x.title} ${x.desc}`));
    return { category, label, detail, evidence: [p ? postEv(p) : e ? liEv(s, `experience ${e.n}`, `${e.title} @ ${e.company}`) : anchorEv], confidence: p && e ? "high" : "medium" };
  });
  if (!qualities.length) qualities.push({ category: "personality", label: "Private by default", detail: "Shares little publicly; probably opens up in person rather than online.", evidence: [anchorEv], confidence: "low" });

  const needs = hits.slice(0, 2).map((h, i) => ({ label: h.need, detail: `Inferred: ${h.label.toLowerCase()} is a fixture of their week, so a partner has to fit around it.`, evidence: hobbies[i].evidence, confidence: "medium" }));
  if (qualities.some((q) => q.category === "ambition")) needs.push({ label: "A partner who respects long build seasons", detail: "Inferred from ownership roles: they'll need someone who doesn't keep score during crunch weeks.", evidence: qualities.find((q) => q.category === "ambition")!.evidence, confidence: "medium" });
  if (!needs.length) needs.push({ label: "Someone curious about their world", detail: "Inferred: with little shared publicly, the right match is someone who asks good questions.", evidence: [anchorEv], confidence: "low" });

  const postsN = s.ig.posts.length;
  const confidence = postsN >= 6 && s.li.experience.length >= 2 ? "high" : postsN >= 3 ? "medium" : "low";
  const samePerson = s.identity.linked || s.identity.nameOverlap === "full" ? "likely" : s.identity.nameOverlap === "none" && !s.identity.handleMatch ? "unlikely" : "unsure";
  const h0 = hits[0]?.label.toLowerCase() ?? "their work";
  return {
    displayName: name,
    tagline: `${cut(s.li.headline.split(/[|@,]/)[0].trim() || "Quietly interesting", 40)} with a soft spot for ${h0}`,
    summary: `${first} is ${s.li.headline ? cut(s.li.headline, 100) : "hard to read from public profiles"}. Off the clock, the posts point to ${hits.map((h) => h.label.toLowerCase()).slice(0, 3).join(", ") || "a fairly private life"}. ${confidence === "low" ? "There's not much public data, so this is a cautious sketch." : "The two profiles line up into one consistent picture."}`,
    location: s.li.location,
    needs,
    hobbies,
    interests,
    otherQualities: qualities.slice(0, 6),
    greenFlags: ["Shows their work, not just the wins", hits.length ? `Sticks with ${h0}` : "Keeps a low public profile", "Credits the people around them"].slice(0, 3),
    possibleDealbreakers: [hits.length ? `Someone who'd resent the time ${h0} takes` : "Someone who needs a big online presence"],
    conversationHooks: [
      ...hits.slice(0, 2).map((h) => (h.posts[0] ? `Ask about post ${h.posts[0].n}: "${words(h.posts[0].caption || h.label, 8)}"` : `Ask how they got into ${h.label.toLowerCase()}`)),
      s.li.experience[0] ? `Ask what surprised them most at ${s.li.experience[0].company}` : "Ask what they'd do with a free Saturday",
    ],
    idealFirstDate: hits[0] ? `${HOBBIES.find((h) => h.label === hits[0].label)!.activity}.` : "A long walk with a good coffee at the end.",
    identity: {
      samePerson,
      reasons: [
        s.identity.linked ? "Instagram bio links to the LinkedIn profile." : "No direct link between the profiles.",
        `Name overlap between the two profiles: ${s.identity.nameOverlap}.`,
      ],
    },
    confidence,
  };
}
