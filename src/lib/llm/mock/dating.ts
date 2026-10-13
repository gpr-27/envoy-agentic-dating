/** Offline mock outputs for the date (plan, turns, debriefs, compact mode). */
import { HOBBIES } from "./lexicon";
import { block, field, items, parsePersona, transcriptLines, type ParsedPersona } from "./parse";

/** FNV-1a for deterministic variety. */
function h32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const pick = <T,>(xs: T[], seed: number): T => xs[seed % xs.length];
const first = (name: string) => name.split(/\s+/)[0] || name;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 4));
}

function overlap(persona: ParsedPersona, said: string): number {
  const mine = words([...persona.hobbies, ...persona.interests, ...persona.needs].join(" "));
  let n = 0;
  for (const w of words(said)) if (mine.has(w)) n++;
  return n;
}

/** Mock date plan from the two pitches. */
export function mockPlan(prompt: string): unknown {
  const a = block(prompt, "agent_a_pitch")?.body ?? "";
  const b = block(prompt, "agent_b_pitch")?.body ?? "";
  const an = first(field(a, "name"));
  const bn = first(field(b, "name"));
  const ha = items(field(a, "hobbies"));
  const hb = items(field(b, "hobbies"));
  const shared = ha.find((x) => hb.includes(x));
  const def = HOBBIES.find((h) => h.label === (shared ?? ha[0])) ?? HOBBIES.find((h) => h.label === hb[0]) ?? HOBBIES[4];
  const la = field(a, "location");
  const lb = field(b, "location");
  const city = la && !la.startsWith("(") ? la : lb && !lb.startsWith("(") ? lb : "";
  return {
    venue: `${def.venue.charAt(0).toUpperCase()}${def.venue.slice(1)}${city ? ` in ${city.split(",")[0]}` : ""}`,
    activity: def.activity,
    why: shared
      ? `${an} and ${bn} both list ${shared.toLowerCase()}, so they start on common ground.`
      : `${an} brings ${lower(ha[0] ?? "curiosity")}, ${bn} brings ${lower(hb[0] ?? "good company")}; this outing gives each a taste of the other's world.`,
    vibe: pick(["playful, low-key", "curious, easygoing", "sporty, chatty", "cosy, unhurried"], h32(an + bn)),
  };
}

const ECHO_STOP = new Set(["about", "there", "their", "which", "would", "thing", "things", "really", "honest", "actually", "together", "tonight"]);

function echoWord(said: string): string {
  const ws = [...words(said)].filter((w) => !ECHO_STOP.has(w)).sort((a, b) => b.length - a.length);
  return ws[0] ?? "that";
}

function turnText(me: ParsedPersona, other: string, idx: number, total: number, lastSaid: string, venue: string, seed: number): string {
  const hobby = (me.hobbies[0] ?? "my work").toLowerCase();
  const hobby2 = (me.hobbies[1] ?? me.hobbies[0] ?? "long walks").toLowerCase();
  const interest = (me.interests[0] ?? "my work").toLowerCase();
  const need = lower(me.needs[0] ?? "someone curious");
  const def = HOBBIES.find((h) => h.label.toLowerCase() === hobby);
  const moment = def?.moment ?? pick(["*the waiter drops off two menus*", "*a gust of wind flips the napkins*", "*somebody nearby laughs way too loud*"], seed);
  const echo = echoWord(lastSaid);
  const end1 = Math.round((total * 3) / 8);
  const end2 = Math.round((total * 6) / 8);
  const warm = seed % 3 !== 0;
  if (idx === 0) return `${moment} Okay, ${other}, ${venue.charAt(0).toLowerCase()}${venue.slice(1)} was a good call. Fair warning: I'll probably turn this into a story about ${hobby}. What made you say yes?`;
  if (idx === 1) return `${moment} You had me at "${echo}". Mine's ${hobby}, almost embarrassingly often. Is that a you-thing too, or am I about to convert you?`;
  if (idx < end1) return `So we've established "${echo}". Confession: ${interest} eats most of my weekdays, and ${hobby2} is how I undo it. What undoes yours?`;
  if (idx === end1) return `Can I ask a real one? What I care about most is ${need}. How does that sit with how your weeks actually look?`;
  if (idx < end2 - 1) return `Honest answer: ${interest} takes a lot of my week, and I won't pretend otherwise. When you said "${echo}", though, that landed.`;
  if (idx < end2) return warm ? `That fits, actually. I need ${need}, and nothing you've said tonight rules that out.` : `I'll be straight with you: I need ${need}, and I'm not sure that's your world. No hard feelings either way.`;
  if (idx === total - 1) return warm ? `I'd actually like that week. Thanks for tonight, ${other}; let me know when the next ${hobby} session is?` : `I'll be honest, I'm not sure our weeks line up. Thanks for tonight, ${other}, genuinely.`;
  return `Okay, a week together: Monday I drag you to ${hobby}, Thursday you pick, something with "${echo}" in it. Sunday we argue about who won the week.`;
}

/** Mock single turn (only sees the speaker's own brief + what was said). */
export function mockTurn(system: string, user: string): unknown {
  const me = parsePersona(system);
  const other = field(user, "date_with") || "you";
  const venue = field(user, "where") || "this place";
  const tm = user.match(/turn (\d+) of (\d+)/);
  const idx = tm ? Number(tm[1]) - 1 : 0;
  const total = tm ? Number(tm[2]) : 8;
  const said = transcriptLines(user, "SAID SO FAR");
  const lastOther = [...said].reverse().find((l) => !l.mine)?.text ?? "";
  const seed = h32(system + user);
  const ov = overlap(me, said.filter((l) => !l.mine).map((l) => l.text).join(" "));
  const vibe = Math.max(2, Math.min(9, 4 + Math.min(3, ov) + (seed % 3) - (idx > 4 && seed % 5 === 0 ? 2 : 0)));
  return {
    text: turnText(me, other, idx, total, lastOther, venue, seed),
    thought: ov ? `${other} keeps landing near things you care about. Promising.` : `Pleasant, but nothing yet that speaks to what you need most.`,
    vibe,
  };
}

/** Mock debrief (own brief + transcript + own notes). */
export function mockDebrief(system: string, user: string): unknown {
  const me = parsePersona(system);
  const said = transcriptLines(user, "WHAT WAS SAID");
  const otherName = system.match(/first date with (.+?) \(well,/)?.[1] ?? "them";
  const theirs = said.filter((l) => !l.mine).map((l) => l.text).join(" ");
  const vibes = [...user.matchAll(/vibe ([\d.]+)\/10/g)].map((m) => Number(m[1]));
  const avg = vibes.length ? vibes.reduce((a, b) => a + b, 0) / vibes.length : 5;
  const seed = h32(system + user);
  const ov = overlap(me, theirs);
  const chemistry = Math.max(1, Math.min(9.5, Math.round((avg + Math.min(2, ov * 0.5) - 1 + ((seed % 31) / 10 - 1.5)) * 10) / 10));
  const second = chemistry >= 6.5;
  return {
    chemistry,
    verdict: second ? `You'd have plenty to talk about with ${otherName}, and the ${lower(me.hobbies[0] ?? "conversation")} overlap is real.` : `${otherName} was good company, but I didn't hear much that fits what you need.`,
    clicked: ov ? [`They picked up on ${lower(me.hobbies[0] ?? "your world")} without prompting`] : ["Easy small talk at the venue"],
    concerns: second ? [] : [`No clear sign they'd want ${lower(me.needs[0] ?? "the same things")}`],
    secondDate: second,
    reason: second ? "Several of your needs came up naturally and the vibe stayed high." : "Pleasant, but the things you care about most never really landed.",
  };
}

/** Mock compact date (both briefs present, role separation respected by construction). */
export function mockCompact(system: string, user: string): unknown {
  const parts = system.split(/PROFILE B \(/);
  const a = parsePersona(parts[0] ?? "");
  const b = parsePersona(parts[1] ?? "");
  const venue = field(user, "where") || "this place";
  const total = Number(system.match(/exactly (\d+) turns/)?.[1] ?? 8);
  const turns: { speaker: string; text: string; thought: string; vibe: number }[] = [];
  for (let i = 0; i < total; i++) {
    const self = i % 2 === 0 ? a : b;
    const other = first((i % 2 === 0 ? b : a).name);
    const seed = h32(`${self.name}${i}${venue}`);
    const last = turns[i - 1]?.text ?? "";
    turns.push({ speaker: i % 2 === 0 ? "a" : "b", text: turnText(self, other, i, total, last, venue, seed), thought: "Noting what fits and what doesn't.", vibe: 4 + (seed % 5) });
  }
  return { turns };
}
