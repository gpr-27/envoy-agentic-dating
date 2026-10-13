/**
 * Compact (budget) mode: one call writes the whole date. Both briefs are in
 * the prompt, so strict role separation is spelled out: each voice may only
 * use its own person's brief and what the other has already said aloud.
 */
import { ACTS, type DatePlan, type ProfileAnalysis } from "@/lib/contracts";
import { clean, firstName } from "../format";
import { personaBrief, personaVoice, privateAgenda } from "./persona";
import { actFor } from "./turn";

/** Role-separation rule (asserted by tests). */
export const ROLE_SEPARATION_RULE =
  "STRICT ROLE SEPARATION: Agent A knows ONLY Profile A; Agent B knows ONLY Profile B. A line may only use its own speaker's profile plus what the other person has already said earlier in the conversation. Nobody may mention a fact about the other person before that person has said it out loud.";

/** System prompt for compact mode. */
export function compactSystem(a: ProfileAnalysis, b: ProfileAnalysis, total: number): string {
  const an = firstName(a.displayName);
  const bn = firstName(b.displayName);
  const schedule = Array.from({ length: total }, (_, i) => `turn ${i + 1}: ${i % 2 === 0 ? `A (${an})` : `B (${bn})`}, act ${actFor(i, total)} (${ACTS[actFor(i, total) - 1].title})`).join("\n");
  return `You are writing the transcript of a real first date between two personal dating agents. Agent A speaks as ${an}, in first person, on ${an}'s behalf; Agent B speaks as ${bn}, on ${bn}'s behalf. Each is their person's honest stand-in for the evening.

${ROLE_SEPARATION_RULE}

SHAPE (exactly ${total} turns, alternating, A first)
${schedule}
Act 1: arriving at the venue, concrete moments there, icebreakers built on specifics. Act 2: values, goals, how a week looks, needs and possible dealbreakers, honestly (don't sell). Act 3: a playful sketch of a week together using only what both said, then a goodbye that hints whether they'd meet again.

EACH TURN: 1-3 spoken sentences (max 45 words) (one optional *stage direction* about the venue), at most one question, specific, warm and witty, no clichés or emojis, never inventing facts beyond the speaker's own profile. thought = that agent's private note to its own person, max 30 words, addressed as "you", never mentioning strategy. vibe = that agent's honest 0-10 read (5 = neutral; don't inflate). The two voices must sound different: A is ${personaVoice(a)}; B is ${personaVoice(b)}.

PROFILE A (${an}) — only Agent A may use this
${personaBrief(a)}
${privateAgenda(a)}

PROFILE B (${bn}) — only Agent B may use this
${personaBrief(b)}
${privateAgenda(b)}`;
}

/** User prompt for compact mode. */
export function compactUser(plan: DatePlan, a: ProfileAnalysis, b: ProfileAnalysis, total: number): string {
  return `THE DATE
where: ${clean(plan.venue, 120)}
doing: ${clean(plan.activity, 200)}
${plan.vibe ? `vibe: ${clean(plan.vibe, 60)}\n` : ""}
Write all ${total} turns for ${firstName(a.displayName)} (A) and ${firstName(b.displayName)} (B) as JSON: { "turns": [ { "speaker": "a" | "b", "text", "thought", "vibe" } ] }.`;
}
