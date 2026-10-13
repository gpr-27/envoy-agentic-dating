/**
 * Date planning: the two agents each pitch what their person would enjoy
 * (only shareable things: hobbies, interests, home base, ideal first date)
 * and agree on one concrete outing.
 */
import type { ProfileAnalysis } from "@/lib/contracts";
import { clean, firstName } from "../format";

/** What an agent is willing to share when planning (no needs/dealbreakers). */
export function pitch(tag: "agent_a_pitch" | "agent_b_pitch", a: ProfileAnalysis): string {
  const rows = [
    `name: ${clean(a.displayName, 60)}`,
    `location: ${clean(a.location, 60) || "(not stated)"}`,
    `hobbies: ${a.hobbies.slice(0, 5).map((t) => clean(t.label, 40)).join("; ")}`,
    `interests: ${a.interests.slice(0, 5).map((t) => clean(t.label, 40)).join("; ")}`,
    `vibe: ${a.otherQualities.filter((q) => q.category === "lifestyle" || q.category === "personality" || q.category === "aesthetic").slice(0, 3).map((q) => clean(q.label, 40)).join("; ") || "(unknown)"}`,
    a.idealFirstDate ? `ideal first date: ${clean(a.idealFirstDate, 160)}` : "",
  ];
  return `<${tag}>\n${rows.filter(Boolean).join("\n")}\n</${tag}>`;
}

/** System prompt for the planning call. */
export function planSystem(): string {
  return `You are two personal dating agents agreeing on a first date for the people you represent. Each of you shared a short pitch about your own person. Pick ONE concrete outing that both people would genuinely enjoy and that gives them something to talk about.

GOOD PLANS
- Grounded in BOTH pitches: a shared hobby, or a smart blend of two different ones (her climbing + his taco obsession = bouldering, then a taqueria).
- Concrete and doable in 2-3 hours: an activity plus a place to talk.
- Place: if both share a city, set it there; if they differ, pick a plausible city between them or one of them and say why; if neither is stated, describe the kind of place without naming a city. Public places only: never a home or private address. You may use a well-known public venue or a descriptive name ("a bouldering gym in the Mission").
- In person only: they are going OUT together. Never a video call, phone call, webinar, livestream or anything online.
- No clichés ("passion", "perfect match", "avid"). Avoid generic defaults (dinner and drinks, coffee, "a lobby", "a co-working space") unless a pitch makes them specific; prefer an activity they can DO together.

OUTPUT (JSON)
venue: just the place (max 8 words), e.g. "Mission Cliffs climbing gym, San Francisco".
activity: what they'll actually do, in order, one sentence. Describe the outing only (no reasons, no facts about the people).
why: 1-2 sentences citing something from EACH pitch by first name.
vibe: 2-4 words ("playful, sporty, low-key").`;
}

/** User prompt for the planning call. */
export function planUser(a: ProfileAnalysis, b: ProfileAnalysis): string {
  return `${pitch("agent_a_pitch", a)}

${pitch("agent_b_pitch", b)}

Agree on the date for ${firstName(a.displayName)} and ${firstName(b.displayName)}.`;
}
