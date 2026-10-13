/**
 * Deterministic clean-up of model output so the analysis can't drift from
 * the two sources: evidence URLs are re-derived from refs (no hallucinated
 * links), unsupported locations are dropped, protected-attribute traits are
 * removed, and strong identity signals are applied.
 */
import type { Evidence, ProfileAnalysis, ReadingLog, ScrapeBundle, Trait } from "@/lib/contracts";
import { identitySignals } from "./format";

const SENSITIVE_RE =
  /\b(sexual(ity)?|gay|lesbian|bisexual|queer|religio\w*|christian|muslim|islam\w*|jewish|hindu|buddhis\w*|church|mosque|synagogue|ethnic\w*|racial|disab\w*|illness|disease|diagnos\w*|pregnan\w*|\d{2}\s*(years?\s*old|yo)|age(d)?\s*\d{2}|democrat|republican)\b/i;

/** Resolve an evidence item's URL from its ref, using only the two sources. */
export function resolveEvidence(ev: Evidence, bundle: ScrapeBundle): Evidence {
  if (ev.source === "linkedin") return { ...ev, url: bundle.linkedin.url || null };
  const m = ev.ref.match(/post\s*#?\s*(\d+)/i);
  if (m) {
    const post = bundle.instagram.posts[Number(m[1]) - 1];
    if (post) return { ...ev, url: post.url || bundle.instagram.url || null };
  }
  return { ...ev, url: bundle.instagram.url || null };
}

function fixTraits<T extends Trait>(list: T[], bundle: ScrapeBundle): T[] {
  const fixed = list.map((t) => ({ ...t, evidence: t.evidence.map((e) => resolveEvidence(e, bundle)) }));
  const safe = fixed.filter((t) => !SENSITIVE_RE.test(`${t.label} ${t.detail}`));
  return safe.length ? safe : fixed.slice(0, 1);
}

function sourceText(bundle: ScrapeBundle): string {
  const li = bundle.linkedin;
  const ig = bundle.instagram;
  return [li.location, li.about, li.headline, ...li.experience.map((e) => `${e.location} ${e.company}`), ig.biography, ...ig.posts.map((p) => `${p.location ?? ""} ${p.caption}`)]
    .join(" ")
    .toLowerCase();
}

/** Keep `location` only if its main token appears in the sources. */
export function verifyLocation(location: string, bundle: ScrapeBundle): string {
  const loc = location.trim();
  if (!loc) return "";
  const head = loc.split(/[,·|/]/)[0].trim().toLowerCase();
  return head && sourceText(bundle).includes(head) ? loc : "";
}

/** Apply all deterministic fixes to a ProfileAnalysis. */
export function postprocessAnalysis(a: ProfileAnalysis, bundle: ScrapeBundle): ProfileAnalysis {
  const sig = identitySignals(bundle);
  const identity = { ...a.identity, reasons: [...a.identity.reasons] };
  if (sig.instagramLinksToLinkedIn && sig.nameOverlap !== "none" && identity.samePerson !== "likely") {
    identity.samePerson = "likely";
    identity.reasons.unshift("Instagram bio links directly to this LinkedIn profile.");
  } else if (!sig.instagramLinksToLinkedIn && sig.nameOverlap === "none" && !sig.handleResemblesName && identity.samePerson === "likely") {
    identity.samePerson = "unsure";
    identity.reasons.unshift("Names on the two profiles don't match and Instagram doesn't link to LinkedIn.");
  }
  const scrub = (xs: string[]) => xs.filter((x) => !SENSITIVE_RE.test(x));
  return {
    ...a,
    displayName: a.displayName.trim() || bundle.linkedin.fullName || bundle.instagram.fullName || bundle.instagram.handle,
    location: verifyLocation(a.location, bundle),
    needs: fixTraits(a.needs, bundle),
    hobbies: fixTraits(a.hobbies, bundle),
    interests: fixTraits(a.interests, bundle),
    otherQualities: fixTraits(a.otherQualities, bundle),
    greenFlags: scrub(a.greenFlags).slice(0, 6),
    possibleDealbreakers: scrub(a.possibleDealbreakers).slice(0, 5),
    conversationHooks: scrub(a.conversationHooks).slice(0, 6),
    identity,
  };
}

/** Clamp the reading log to 10 steps and resolve evidence URLs. */
export function postprocessReadingLog(log: ReadingLog, bundle: ScrapeBundle): ReadingLog {
  return {
    firstImpression: log.firstImpression,
    steps: log.steps.slice(0, 10).map((s) => ({ ...s, evidence: s.evidence.map((e) => resolveEvidence(e, bundle)) })),
  };
}
