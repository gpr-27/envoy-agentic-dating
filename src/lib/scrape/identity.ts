/**
 * Deterministic identity signals linking a LinkedIn and an Instagram profile.
 * Feeds the reader agent's IdentityCheck (it does not decide on its own).
 */
import type { NormalizedInstagram, NormalizedLinkedIn } from "@/lib/contracts";
import { canonicalizeLinkedIn } from "./urls";

/** Cheap, explainable signals that two profiles belong to the same person. */
export type IdentitySignals = {
  /** Instagram bio links (or bio text) point to this LinkedIn profile. */
  externalLink: boolean;
  /** Display names share a first/last name token. */
  nameMatch: boolean;
  /** Same city token appears in the LinkedIn location and Instagram bio. */
  locationMatch: boolean;
  /** Human-readable reasons for the positive signals. */
  reasons: string[];
};

function tokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** Computes identity signals between the two normalised profiles. */
export function identitySignals(li: NormalizedLinkedIn, ig: NormalizedInstagram): IdentitySignals {
  const reasons: string[] = [];
  const liCanon = canonicalizeLinkedIn(li.url);
  const slug = liCanon.ok ? liCanon.slug : "";
  const linkTexts = [...ig.externalUrls, ig.biography];
  const externalLink =
    !!slug &&
    linkTexts.some((t) =>
      (t.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s"'<>)]+/gi) ?? []).some((u) => {
        const c = canonicalizeLinkedIn(u);
        return c.ok && c.slug === slug;
      }),
    );
  if (externalLink) reasons.push("Instagram bio links to this LinkedIn profile");

  const liName = new Set(tokens(li.fullName));
  const igNameTokens = [...tokens(ig.fullName), ...tokens(ig.handle.replace(/[._]/g, " "))];
  const nameMatch = igNameTokens.some((t) => liName.has(t));
  if (nameMatch) reasons.push(`Names overlap ("${li.fullName}" / "${ig.fullName || ig.handle}")`);

  const city = tokens(li.location.split(",")[0] ?? "");
  const bio = new Set(tokens(ig.biography));
  const locationMatch = city.length > 0 && city.every((t) => bio.has(t));
  if (locationMatch) reasons.push(`Both mention ${li.location.split(",")[0]}`);

  return { externalLink, nameMatch, locationMatch, reasons };
}
