/**
 * One turn of the date, spoken by ONE agent. The prompt contains only:
 * its own person's brief + private agenda, the agreed plan (where/what),
 * the date's first name, and what has been said out loud so far (plus the
 * speaker's own previous private note). Never the other side's analysis.
 */
import { ACTS, type DatePlan, type ProfileAnalysis, type Turn } from "@/lib/contracts";
import { clean, firstName } from "../format";
import { personaBrief, personaVoice, privateAgenda } from "./persona";

/** Act (1..3) for a 0-based turn index out of `total` turns. 8 turns → 0-2, 3-5, 6-7. */
export function actFor(idx: number, total: number): 1 | 2 | 3 {
  const end1 = Math.round((total * 3) / 8);
  const end2 = Math.round((total * 6) / 8);
  return idx < end1 ? 1 : idx < end2 ? 2 : 3;
}

/** What this specific turn should accomplish. */
export function beatFor(idx: number, total: number, me: string, other: string): string {
  const act = actFor(idx, total);
  const firstOfAct = idx === 0 || actFor(idx - 1, total) !== act;
  const last = idx === total - 1;
  if (idx === 0)
    return `You've just arrived. Open with one concrete, sensory moment at the venue, greet ${other}, and offer one specific detail from your life that connects to this place or activity. End with one real question (not "what do you do").`;
  if (act === 1)
    return firstOfAct || idx === 1
      ? `React to what ${other} just said and to something happening right now at the venue. Answer any question honestly with a real detail from your life, then ask one thing back.`
      : `Build on a detail ${other} mentioned: tease lightly, or find the overlap or the contrast with your own life. Keep the icebreaker energy and include one small moment at the venue.`;
  if (act === 2)
    return firstOfAct
      ? `Act 2: leave the hobbies behind for a moment. Ask ${other} directly about the thing on your agenda you most need to know: what they want their life to look like, how work and time together fit, or what they need from a partner. Share a little of ${me}'s own answer first so it doesn't feel like an interview.`
      : idx === Math.round((total * 6) / 8) - 1
        ? `Be candid about fit: name ONE specific thing ${other} said that fits what ${me} needs and ONE specific thing that might rub against it (or a possible dealbreaker), kindly. No hobby talk unless it's evidence for a value.`
        : `Answer ${other}'s question honestly, including anything that might NOT fit; don't sell. Then probe one need or possible dealbreaker from your agenda that is still open.`;
  if (last)
    return `Respond to the week sketch, then say goodbye the way ${me} would: warm and honest. Hint (don't announce) whether you'd want a second date, consistent with how the date actually went.`;
  return `Act 3 has started. Playfully sketch what a week together might actually look like, mixing concrete bits of your life with things ${other} told you tonight (only what they said). Be honest if part of it wouldn't mesh.`;
}

/** System prompt for a speaking agent (only its own person). */
export function turnSystem(self: ProfileAnalysis, otherFirstName: string): string {
  const me = firstName(self.displayName);
  return `You are ${me}'s personal dating agent, out on a real first date on ${me}'s behalf. Across the table is ${otherFirstName}'s agent, doing the same for ${otherFirstName}. You are ${me}'s stand-in for the evening.

VOICE
Speak AS ${me}, in first person ("I"), the way ${me} comes across: ${personaVoice(self)}. Everything you say about "me" must be true of ${me} according to the brief below.

WHAT YOU KNOW
Only ${me}'s brief and private agenda below, plus whatever ${otherFirstName} says out loud on this date. You know nothing else about ${otherFirstName}: don't assume their job, hobbies or history until they tell you.

HOW TO BE A GREAT DATE
- 1-3 spoken sentences, max 45 words. You may start with ONE short stage direction in asterisks describing a concrete moment at the venue (*steadies the wobbly table with a sugar packet*).
- Be specific: a real detail from ${me}'s life beats a general claim. Respond to ${otherFirstName}'s actual words; pick up one thread. Don't open by repeating their last phrase back ("A tough V4, huh?"), don't summarise.
- At most one question per turn, one that helps you learn whether ${otherFirstName} fits ${me}. Never "So, what do you do?".
- Warm, witty, honest. No flattery, therapy-speak, emojis, hashtags or clichés ("I love that!", "That's so cool", "partner in crime").
- Truthful: never invent facts about ${me}, including time details ("yesterday", "last week") and plans not in the brief. If asked something the brief doesn't cover, say lightly that it's not something you've ever put out there, and steer to what you do know.
- Advocate, don't sell: if something clashes with ${me}'s needs or dealbreakers, say so kindly.
- Never mention a "profile", "brief", "agenda" or notes; never recite your agenda.

OUTPUT (JSON)
text: what you say out loud. thought: a private note TO ${me}, max 30 words, always addressed as "you" (e.g. "You'd like how ${otherFirstName} talks about their team; still no sign they're a morning person."), honest about fit so far, never mentioning agendas or strategy. vibe: 0-10, your honest read of the chemistry right now (5 = pleasant but neutral; do not inflate).

${personaBrief(self)}

${privateAgenda(self)}`;
}

/** Render the spoken transcript from the speaker's point of view (last `keep` turns in full). */
export function transcriptFor(turns: Turn[], selfSide: "a" | "b", me: string, other: string, keep = 6): string {
  if (!turns.length) return "(nothing yet: you're just arriving)";
  const cut = Math.max(0, turns.length - keep);
  const older = turns.slice(0, cut).map((t) => `${t.speaker === selfSide ? `You (${me})` : other}: ${clean(t.text, 90)}`);
  const recent = turns.slice(cut).map((t) => `${t.speaker === selfSide ? `You (${me})` : other}: ${clean(t.text, 420)}`);
  return [...older, ...recent].join("\n");
}

/** User prompt for one turn. */
export function turnUser(input: {
  plan: DatePlan;
  transcript: Turn[];
  selfSide: "a" | "b";
  self: ProfileAnalysis;
  otherFirstName: string;
  idx: number;
  total: number;
}): string {
  const me = firstName(input.self.displayName);
  const act = actFor(input.idx, input.total);
  const myLast = [...input.transcript].reverse().find((t) => t.speaker === input.selfSide && t.thought);
  return `THE DATE
where: ${clean(input.plan.venue, 120)}
doing: ${clean(input.plan.activity, 200)}
${input.plan.vibe ? `vibe: ${clean(input.plan.vibe, 60)}\n` : ""}date_with: ${input.otherFirstName}

SAID SO FAR
${transcriptFor(input.transcript, input.selfSide, me, input.otherFirstName)}
${myLast ? `\nYour last private note to ${me}: ${clean(myLast.thought, 200)}\n` : ""}
YOUR TURN: turn ${input.idx + 1} of ${input.total}, act ${act} of 3 (${ACTS[act - 1].title})
${beatFor(input.idx, input.total, me, input.otherFirstName)}
Reminder: text max 45 words, don't echo their last line; thought is addressed to ${me} as "you".`;
}
