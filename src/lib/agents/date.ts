/**
 * The date itself: plan → alternating turns (each a separate call to the
 * speaking agent only) → two private debriefs. Compact mode writes all
 * turns in one call for when the free-tier budget is low.
 */
import { z } from "zod";
import { DatePlan, FULL_DATE_TURNS, type DateRecord, type Debrief, type ProfileAnalysis, type Turn } from "@/lib/contracts";
import { complete } from "@/lib/llm/router";
import { firstName } from "./format";
import { compactSystem, compactUser } from "./prompts/compact";
import { debriefSystem, debriefUser } from "./prompts/debrief";
import { planSystem, planUser } from "./prompts/plan";
import { actFor, turnSystem, turnUser } from "./prompts/turn";

const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));

/** What a speaking agent returns for one turn. */
export const TurnOutput = z.object({
  text: z.string().min(1),
  thought: z.string().default(""),
  vibe: z.number(),
});

/** What a debriefing agent returns. */
export const DebriefOutput = z.object({
  chemistry: z.number(),
  verdict: z.string().min(1),
  clicked: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  secondDate: z.boolean(),
  reason: z.string().default(""),
});

const CompactOutput = z.object({
  turns: z
    .array(z.object({ speaker: z.enum(["a", "b"]).optional(), text: z.string().min(1), thought: z.string().default(""), vibe: z.number() }))
    .min(FULL_DATE_TURNS),
});

/** Speaker and act for turn `idx` (A starts, alternating). */
export function turnMeta(idx: number, total: number = FULL_DATE_TURNS): { speaker: "a" | "b"; act: 1 | 2 | 3 } {
  return { speaker: idx % 2 === 0 ? "a" : "b", act: actFor(idx, total) };
}

/** Both agents agree on a concrete outing grounded in both profiles. */
export async function planDate(a: ProfileAnalysis, b: ProfileAnalysis): Promise<{ plan: DatePlan; model: string }> {
  const res = await complete({ task: "plan", system: planSystem(), user: planUser(a, b), schema: DatePlan });
  return { plan: res.data, model: res.model };
}

/**
 * Next turn of a full-mode date. Resumable: the turn index is the current
 * transcript length. The speaker's prompt contains only its own analysis,
 * its private agenda, the plan's where/what, and what was said aloud.
 */
export async function nextTurn(input: { date: DateRecord; a: ProfileAnalysis; b: ProfileAnalysis }): Promise<{ turn: Turn; model: string }> {
  const { date } = input;
  const idx = date.transcript.length;
  if (idx >= FULL_DATE_TURNS) throw new Error(`date ${date.id} already has ${idx} turns`);
  if (!date.plan) throw new Error(`date ${date.id} has no plan yet`);
  const { speaker, act } = turnMeta(idx);
  const self = speaker === "a" ? input.a : input.b;
  const other = speaker === "a" ? input.b : input.a;
  const otherFirst = firstName(other.displayName);
  const res = await complete({
    task: "turn",
    system: turnSystem(self, otherFirst),
    user: turnUser({ plan: date.plan, transcript: date.transcript, selfSide: speaker, self, otherFirstName: otherFirst, idx, total: FULL_DATE_TURNS }),
    schema: TurnOutput,
  });
  const turn: Turn = { idx, act, speaker, text: res.data.text.trim(), thought: res.data.thought.trim(), vibe: clamp10(res.data.vibe) };
  return { turn, model: res.model };
}

/** Private debrief by one agent to its own person (own analysis + transcript + own notes only). */
export async function debrief(input: { date: DateRecord; self: "a" | "b"; a: ProfileAnalysis; b: ProfileAnalysis }): Promise<{ debrief: Debrief; model: string }> {
  const selfA = input.self === "a" ? input.a : input.b;
  const other = input.self === "a" ? input.b : input.a;
  const otherFirst = firstName(other.displayName);
  const res = await complete({
    task: "debrief",
    system: debriefSystem(selfA, otherFirst),
    user: debriefUser({ plan: input.date.plan, transcript: input.date.transcript, selfSide: input.self, self: selfA, otherFirstName: otherFirst }),
    schema: DebriefOutput,
  });
  const d = res.data;
  return {
    debrief: {
      chemistry: clamp10(d.chemistry),
      verdict: d.verdict.trim(),
      clicked: d.clicked.slice(0, 5),
      concerns: d.concerns.slice(0, 4),
      secondDate: d.secondDate,
      reason: d.reason.trim() || d.verdict.trim(),
    },
    model: res.model,
  };
}

/** Compact mode: all FULL_DATE_TURNS turns in one call, with strict role separation instructions. */
export async function compactDate(input: { a: ProfileAnalysis; b: ProfileAnalysis; plan: DatePlan }): Promise<{ transcript: Turn[]; model: string }> {
  const total = FULL_DATE_TURNS;
  const res = await complete({
    task: "compact_date",
    system: compactSystem(input.a, input.b, total),
    user: compactUser(input.plan, input.a, input.b, total),
    schema: CompactOutput,
  });
  const transcript: Turn[] = res.data.turns.slice(0, total).map((t, idx) => {
    const { speaker, act } = turnMeta(idx, total);
    return { idx, act, speaker, text: t.text.trim(), thought: t.thought.trim(), vibe: clamp10(t.vibe) };
  });
  return { transcript, model: res.model };
}
