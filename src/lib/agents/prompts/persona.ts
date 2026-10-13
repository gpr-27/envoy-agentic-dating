/**
 * The representative agent's knowledge: a compact brief of ITS OWN person
 * plus a private agenda derived from that person's needs, dealbreakers and
 * hooks. Built only from one ProfileAnalysis — never the date's.
 */
import type { ProfileAnalysis, Quality, Trait } from "@/lib/contracts";
import { clean, firstName } from "../format";

function short(t: Trait, max = 110, labelMax = 50): string {
  const detail = clean(t.detail, max);
  return detail ? `${clean(t.label, labelMax)} (${detail})` : clean(t.label, labelMax);
}

function voiceHints(a: ProfileAnalysis): string {
  const voice = a.otherQualities.filter((q: Quality) => q.category === "communication" || q.category === "humour" || q.category === "personality");
  const hints = voice.slice(0, 3).map((q) => clean(q.label, 50).toLowerCase());
  return hints.length ? hints.join(", ") : "natural, warm, specific";
}

/** Short spoken-voice description, e.g. "dry humour, terse captions, curious". */
export function personaVoice(a: ProfileAnalysis): string {
  return voiceHints(a);
}

/** Compact brief of the agent's own person (target ≤ ~450 tokens). */
export function personaBrief(a: ProfileAnalysis): string {
  const name = clean(a.displayName, 60);
  const rows = [
    `name: ${name}`,
    `in one line: ${clean(a.tagline, 120)}`,
    `who: ${clean(a.summary, 420)}`,
    a.location ? `based in: ${clean(a.location, 60)}` : "",
    `does: ${a.hobbies.slice(0, 5).map((t) => short(t, 90)).join("; ")}`,
    `cares about: ${a.interests.slice(0, 5).map((t) => short(t, 70)).join("; ")}`,
    `character: ${a.otherQualities.slice(0, 6).map((q) => `${clean(q.label, 40)} [${q.category}]`).join("; ")}`,
    a.greenFlags.length ? `good things about me: ${a.greenFlags.slice(0, 4).map((g) => clean(g, 70)).join("; ")}` : "",
    a.idealFirstDate ? `my ideal first date: ${clean(a.idealFirstDate, 140)}` : "",
  ];
  return `<your_person>\n${rows.filter(Boolean).join("\n")}\n</your_person>`;
}

/** Private agenda: what to find out, what to watch for, what to share. */
export function privateAgenda(a: ProfileAnalysis): string {
  const rows = [
    `find out whether they could give ${firstName(a.displayName)}: ${a.needs.slice(0, 4).map((t) => short(t, 90, 110)).join("; ")}`,
    a.possibleDealbreakers.length ? `quietly watch for (possible dealbreakers): ${a.possibleDealbreakers.slice(0, 4).map((d) => clean(d, 80)).join("; ")}` : "",
    a.conversationHooks.length
      ? `stories worth telling about yourself (things people love to ask you about): ${a.conversationHooks.slice(0, 4).map((h) => clean(h, 100)).join("; ")}`
      : "",
  ];
  return `<private_agenda>\n${rows.filter(Boolean).join("\n")}\n</private_agenda>`;
}
