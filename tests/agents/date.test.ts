import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Debrief, FULL_DATE_TURNS, type DatePlan, type DateRecord, type ProfileAnalysis } from "@/lib/contracts";
import { compactDate, debrief, nextTurn, planDate } from "@/lib/agents";
import { ROLE_SEPARATION_RULE } from "@/lib/agents/prompts/compact";
import { debriefSystem } from "@/lib/agents/prompts/debrief";
import { turnSystem } from "@/lib/agents/prompts/turn";
import { ProviderError } from "@/lib/llm/errors";
import { setProvider } from "@/lib/llm/router";
import { analyse, newDate, recordPrompts, type Recorded } from "./helpers";
import { analysis, leo, maya } from "./fixtures";

let A: ProfileAnalysis;
let B: ProfileAnalysis;
let rec: ReturnType<typeof recordPrompts> | null = null;

beforeAll(async () => {
  A = await analyse(maya);
  B = await analyse(leo);
});
afterEach(() => rec?.stop());

/** Run a full-mode date, returning the record and which side each recorded call belonged to. */
async function fullDate(): Promise<{ date: DateRecord; calls: (Recorded & { side: "a" | "b" | "both" })[] }> {
  rec = recordPrompts();
  const tagged: (Recorded & { side: "a" | "b" | "both" })[] = [];
  const tagLast = (side: "a" | "b" | "both") => tagged.push({ ...rec!.calls[rec!.calls.length - 1], side });
  let date = newDate("maya", "leo");
  const { plan } = await planDate(A, B);
  tagLast("both");
  date = { ...date, plan, status: "in_progress" };
  for (let i = 0; i < FULL_DATE_TURNS; i++) {
    const { turn } = await nextTurn({ date, a: A, b: B });
    tagLast(turn.speaker);
    date = { ...date, transcript: [...date.transcript, turn] };
  }
  const da = await debrief({ date, self: "a", a: A, b: B });
  tagLast("a");
  const db = await debrief({ date, self: "b", a: A, b: B });
  tagLast("b");
  return { date: { ...date, debriefA: da.debrief, debriefB: db.debrief, status: "done" }, calls: tagged };
}

function analysisStrings(p: ProfileAnalysis): string[] {
  const traits = [...p.needs, ...p.hobbies, ...p.interests, ...p.otherQualities];
  return [
    p.displayName,
    p.tagline,
    p.summary,
    p.idealFirstDate,
    ...p.greenFlags,
    ...p.possibleDealbreakers,
    ...p.conversationHooks,
    ...traits.flatMap((t) => [t.label, t.detail, ...t.evidence.map((e) => e.quote)]),
  ].filter((s) => s && s.trim().length >= 5);
}

function assertIsolation(
  calls: (Recorded & { side: "a" | "b" | "both" })[],
  date: DateRecord,
  self: "a" | "b",
  mine: ProfileAnalysis,
  theirs: ProfileAnalysis,
  plan: DatePlan,
) {
  const lc = (s: string) => s.toLowerCase();
  const mineText = lc(JSON.stringify(mine));
  const theirSpeech = lc(date.transcript.filter((t) => t.speaker !== self).map((t) => t.text).join(" "));
  const shared = lc(`${plan.venue} ${plan.activity} ${plan.vibe}`);
  const template = lc(turnSystem(analysis("Neutral"), "Other") + debriefSystem(analysis("Neutral"), "Other"));
  const forbidden = analysisStrings(theirs).filter((s) => {
    const x = lc(s);
    return !mineText.includes(x) && !theirSpeech.includes(x) && !shared.includes(x) && !template.includes(x);
  });
  expect(forbidden.length).toBeGreaterThan(5);
  const prompts = calls.filter((c) => c.side === self);
  expect(prompts.length).toBe(FULL_DATE_TURNS / 2 + 1);
  for (const c of prompts) {
    const text = lc(`${c.system}\n${c.user}`);
    for (const s of forbidden) expect(text, `leaked "${s}" into ${self}'s ${c.task} prompt`).not.toContain(lc(s));
    // The other side's private thoughts never reach this agent.
    for (const t of date.transcript.filter((t) => t.speaker !== self && t.thought.length > 10)) expect(text).not.toContain(lc(t.thought));
  }
}

describe("Dating agents", () => {
  it("AG-06 persona prompt is built only from its own analysis + agenda", () => {
    const sys = turnSystem(A, "Leo");
    expect(sys).toContain("<your_person>");
    expect(sys).toContain("<private_agenda>");
    expect(sys).toContain(A.needs[0].label.slice(0, 30));
    expect(sys).toContain("Speak AS Maya");
    expect(sys).not.toContain(B.displayName);
    expect(sys).not.toContain(B.tagline);
    expect(turnSystem(analysis("Maya Test", { hobbies: ["Bouldering"], needs: ["Someone patient"] }), "Leo")).toMatchSnapshot();
  });

  it("AG-07 prompt isolation: neither agent ever sees the other's analysis or private thoughts", async () => {
    const { date, calls } = await fullDate();
    assertIsolation(calls, date, "a", A, B, date.plan!);
    assertIsolation(calls, date, "b", B, A, date.plan!);
    // and full names / summaries never cross
    for (const c of calls.filter((x) => x.side === "a")) expect(`${c.system}${c.user}`).not.toContain(B.summary);
  });

  it("AG-08 full-mode structure: plan → 8 alternating turns over 3 acts → 2 debriefs", async () => {
    const { date, calls } = await fullDate();
    expect(calls.map((c) => c.task)).toEqual(["plan", ...Array(8).fill("turn"), "debrief", "debrief"]);
    expect(date.transcript.map((t) => t.speaker).join("")).toBe("abababab");
    expect(date.transcript.map((t) => t.act)).toEqual([1, 1, 1, 2, 2, 2, 3, 3]);
    expect(date.transcript.map((t) => t.idx)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const t of date.transcript) {
      expect(t.text.length).toBeGreaterThan(10);
      expect(t.vibe).toBeGreaterThanOrEqual(0);
      expect(t.vibe).toBeLessThanOrEqual(10);
    }
    expect(Debrief.safeParse(date.debriefA).success).toBe(true);
    expect(Debrief.safeParse(date.debriefB).success).toBe(true);
    expect(date.plan!.venue.length).toBeGreaterThan(3);
    // Turn prompts carry the act beat and the venue.
    expect(calls[1].user).toContain("act 1 of 3");
    expect(calls[7].user).toContain("act 3 of 3");
    expect(calls[1].user).toContain(date.plan!.venue);
  });

  it("AG-09 compact mode: one transcript call with role separation, then 2 debriefs", async () => {
    rec = recordPrompts();
    const { plan } = await planDate(A, B);
    const { transcript } = await compactDate({ a: A, b: B, plan });
    expect(transcript).toHaveLength(FULL_DATE_TURNS);
    expect(transcript.map((t) => t.speaker).join("")).toBe("abababab");
    expect(transcript.map((t) => t.act)).toEqual([1, 1, 1, 2, 2, 2, 3, 3]);
    let date: DateRecord = { ...newDate("maya", "leo"), mode: "compact", plan, transcript };
    await debrief({ date, self: "a", a: A, b: B });
    await debrief({ date, self: "b", a: A, b: B });
    const tasks = rec.calls.map((c) => c.task);
    expect(tasks.filter((t) => t !== "plan")).toEqual(["compact_date", "debrief", "debrief"]);
    expect(rec.calls.find((c) => c.task === "compact_date")!.system).toContain(ROLE_SEPARATION_RULE);
    date = { ...date, status: "done" };
    expect(date.mode).toBe("compact");
  });

  it("AG-10 resume mid-date: a failure at turn 5 leaves 4 turns; re-run continues at idx 4 with no duplicates", async () => {
    let date: DateRecord = { ...newDate("maya", "leo"), plan: (await planDate(A, B)).plan };
    for (let i = 0; i < 4; i++) date = { ...date, transcript: [...date.transcript, (await nextTurn({ date, a: A, b: B })).turn] };
    setProvider("mock", {
      name: "mock",
      isAvailable: () => true,
      supportsVision: () => false,
      generate: async () => {
        throw new ProviderError("server", "boom", { status: 500 });
      },
    });
    await expect(nextTurn({ date, a: A, b: B })).rejects.toThrow();
    expect(date.transcript).toHaveLength(4);
    rec = recordPrompts(); // restores a working mock
    const { turn } = await nextTurn({ date, a: A, b: B });
    expect(turn.idx).toBe(4);
    expect(turn.speaker).toBe("a");
    expect(turn.act).toBe(2);
    date = { ...date, transcript: [...date.transcript, turn] };
    expect(new Set(date.transcript.map((t) => t.idx)).size).toBe(5);
  });

  it("rejects a 9th turn and a turn without a plan", async () => {
    const base = newDate("maya", "leo");
    await expect(nextTurn({ date: base, a: A, b: B })).rejects.toThrow(/no plan/);
    const full = { ...base, plan: { venue: "v", activity: "x", why: "y", vibe: "" }, transcript: Array.from({ length: 8 }, (_, i) => ({ idx: i, act: 1, speaker: "a" as const, text: "t", thought: "", vibe: 5 })) };
    await expect(nextTurn({ date: full, a: A, b: B })).rejects.toThrow(/already has 8 turns/);
  });
});
