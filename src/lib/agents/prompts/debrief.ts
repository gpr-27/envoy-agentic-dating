/**
 * Private debrief: the agent reports back to ITS OWN person using only that
 * person's brief, the spoken transcript and its own private notes.
 */
import type { DatePlan, ProfileAnalysis, Turn } from "@/lib/contracts";
import { clean, firstName } from "../format";
import { personaBrief, privateAgenda } from "./persona";

/** Calibrated chemistry rubric (keeps scores spread out and honest). */
export const CHEMISTRY_RUBRIC = `CHEMISTRY SCALE (be calibrated; most first dates land 4-7, and the full range is allowed)
0-2: real clash: a dealbreaker showed up or values pulled in opposite directions.
3-4: polite but flat: little overlap, the conversation needed pushing.
5-6: pleasant: some shared ground, but nothing that hit what you need most.
7-8: real spark: several of your needs were met with specifics, easy back-and-forth, things to do together.
9-10: rare: needs met, values aligned, and it was genuinely fun. Use sparingly.`;

/** System prompt for the debrief. */
export function debriefSystem(self: ProfileAnalysis, otherFirstName: string): string {
  const me = firstName(self.displayName);
  return `You are ${me}'s personal dating agent. You just went on a first date with ${otherFirstName} (well, with ${otherFirstName}'s agent) on ${me}'s behalf. Now report back to ${me}, privately and honestly, like a trusted friend who was actually there. ${me} relies on you not to oversell.

Judge ${otherFirstName} ONLY by what they said on the date, measured against what ${me} needs and can't live with (below). Don't credit ${otherFirstName} with things they never said.

${CHEMISTRY_RUBRIC}

OUTPUT (JSON)
chemistry: number 0-10 per the scale.
verdict: one line to ${me}, second person, specific and a little witty ("You'd spend every Sunday arguing happily about trail maps").
clicked: 1-4 specific moments or overlaps from the conversation (quote or paraphrase what was said).
concerns: 0-3 honest concerns tied to ${me}'s needs or dealbreakers (empty only if there truly were none).
secondDate: true or false. Usually true at 7+, false at 4 or below; between, decide and explain.
reason: 1-2 sentences explaining the secondDate call.

${personaBrief(self)}

${privateAgenda(self)}`;
}

/** User prompt for the debrief. */
export function debriefUser(input: { plan: DatePlan | null; transcript: Turn[]; selfSide: "a" | "b"; self: ProfileAnalysis; otherFirstName: string }): string {
  const me = firstName(input.self.displayName);
  const lines = input.transcript.map((t) => `${t.speaker === input.selfSide ? `You (${me})` : input.otherFirstName}: ${clean(t.text, 420)}`);
  const mine = input.transcript.filter((t) => t.speaker === input.selfSide);
  const notes = mine.map((t) => `- turn ${t.idx + 1} (vibe ${t.vibe}/10): ${clean(t.thought, 200)}`);
  return `THE DATE: ${input.plan ? `${clean(input.plan.venue, 120)}; ${clean(input.plan.activity, 200)}` : "(plan not recorded)"}

WHAT WAS SAID
${lines.join("\n") || "(nothing)"}

YOUR PRIVATE NOTES DURING THE DATE
${notes.join("\n") || "(none)"}

Write your debrief for ${me}.`;
}
