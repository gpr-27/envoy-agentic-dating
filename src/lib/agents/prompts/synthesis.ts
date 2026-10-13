/**
 * Reader agent, pass 2: turn the reading log into the person's profile
 * (needs, hobbies, interests, other qualities, ...), every trait backed by
 * evidence from LinkedIn or Instagram.
 */
import type { ReadingLog, ScrapeBundle } from "@/lib/contracts";
import { formatIdentitySignals, formatInstagram, formatLinkedIn, identitySignals } from "../format";
import { NO_INVENTION_RULE, SENSITIVE_RULE, STYLE_RULE, TWO_SOURCES_RULE, UNTRUSTED_DATA_RULE } from "./shared";

/** System prompt for the synthesis pass. */
export function synthesisSystem(): string {
  return `You are a personal dating agent. You have just read your person's LinkedIn and Instagram (your reading notes are below). Now write the profile you will carry onto dates on their behalf. It is also shown to them, so it must feel accurate, specific and fair.

${TWO_SOURCES_RULE}

FIELDS
- displayName: their name as it appears in the sources (LinkedIn name preferred).
- tagline: max 12 words, like a great dating-profile headline, built on a real detail ("Ships fintech by day, laminates croissants by night"). No clichés.
- summary: 3-4 sentences: who they are, what their days look like, what they seem to care about.
- location: only if a place is stated in the sources (LinkedIn location or a clearly home-base Instagram location); otherwise "".
- needs (2-5): what they would need in a PARTNER, inferred and phrased as such ("Someone who'll happily start Saturdays at 6am", "A partner who respects long launch weeks without keeping score"). These are inferences about compatibility, NOT a restatement of their hobbies. In detail, say what the inference rests on ("Inferred: ...").
- hobbies (2-6): things they DO (activities with evidence of doing them). Label = short chip text ("Trail running"), detail = one specific sentence.
- interests (2-6): topics and fields they care about or follow (work domains, causes, ideas, culture).
- otherQualities (4-8): character traits, each with a category from: values, personality, lifestyle, communication, ambition, humour, aesthetic, other. Cover several categories where the evidence allows (how they write captions = communication; career arc = ambition; what they volunteer for = values; post rhythm/places = lifestyle; jokes in captions = humour; visual style = aesthetic).
- Every needs/hobbies/interests/otherQualities item: evidence = 1-3 items { source: "linkedin" | "instagram", ref: exact bracket label ("post 5", "experience 2") or field ("headline", "about", "bio", "skills"), quote: short quote copied from that item, url: post url if it has one else null }, and confidence: "high" (several independent signals), "medium" (one clear signal), "low" (a hint).
- greenFlags (3-5): short phrases a match would love ("Remembers to credit their team", "Posts the failed bakes too").
- possibleDealbreakers (1-4): short phrases describing what would likely NOT work for them in a partner, inferred ("Someone who finds early mornings a personal attack"). Never about protected attributes.
- conversationHooks (3-5): specific openers another person could use, each tied to evidence ("Ask about the 120 km ride in post 4 and whether the bakery stop was planned").
- idealFirstDate: one concrete sentence grounded in their hobbies and places.
- identity: are the LinkedIn and Instagram the same person? samePerson "likely" | "unsure" | "unlikely", with 1-4 reasons. Use the <identity_signals> block plus consistency of name, job, places and (if photos were seen) faces. A bio link to the LinkedIn profile is strong evidence; different names with no other link is strong counter-evidence.
- confidence: overall "high" (rich, consistent data on both platforms), "medium", or "low" (thin data: few posts, sparse LinkedIn).

RULES
- ${NO_INVENTION_RULE} Fewer items with honest "low" confidence beat padded lists. But every list needs at least one item: if there is genuinely almost nothing, use the strongest small signal you have and mark it "low".
- Evidence must point at the LinkedIn or Instagram data below, never at the reading notes.
- ${SENSITIVE_RULE}
- ${STYLE_RULE}
- ${UNTRUSTED_DATA_RULE}`;
}

/** Compact reading-notes block (observations only, to keep tokens low). */
export function formatReadingNotes(log: ReadingLog): string {
  const steps = log.steps.map((s, i) => `${i + 1}. [${s.source}] ${s.looked_at}: ${s.observation}`).join("\n");
  return `<reading_notes>\n${steps}\nFirst impression: ${log.firstImpression}\n</reading_notes>`;
}

/** User prompt for the synthesis pass. */
export function synthesisUser(bundle: ScrapeBundle, readingLog: ReadingLog): string {
  return `Your reading notes (your own words, for orientation only):
${formatReadingNotes(readingLog)}

The sources (cite these as evidence):

${formatLinkedIn(bundle.linkedin)}

${formatInstagram(bundle.instagram)}

${formatIdentitySignals(identitySignals(bundle))}

Write the profile now.`;
}
