import { describe, expect, it } from "vitest";
import { DateRecord, RankingEntry, type Debrief } from "@/lib/contracts";
import { computeRankings } from "@/lib/agents";

const deb = (chemistry: number, secondDate: boolean): Debrief => ({ chemistry, verdict: `verdict ${chemistry}`, clicked: ["tacos"], concerns: [], secondDate, reason: "r" });

function date(id: string, aId: string, bId: string, a: Debrief, b: Debrief): DateRecord {
  return DateRecord.parse({ id, pool: "t", aId, bId, status: "done", mode: "full", debriefA: a, debriefB: b, createdAt: "2026-10-13", updatedAt: "2026-10-13" });
}

const pre: Record<string, number> = { b: 0.5, c: 0.9, d: 0.4, e: 0.4 };

describe("Rankings", () => {
  it("AG-14 math: dated = 0.5·mine + 0.3·theirs + 0.2·pre; projected = 0.8·pre; mutual when both want a second date", () => {
    const dates = [date("d1", "me", "b", deb(8, true), deb(6, true)), date("d2", "c", "me", deb(3, false), deb(4, false))];
    const r = computeRankings({ personId: "me", candidateIds: ["b", "c", "d"], dates, prescoreOf: (id) => pre[id], reasonsOf: () => ["Both into climbing"] });
    for (const e of r) expect(RankingEntry.safeParse(e).success).toBe(true);
    const b = r.find((e) => e.personId === "b")!;
    expect(b.score).toBeCloseTo(100 * (0.5 * 0.8 + 0.3 * 0.6 + 0.2 * 0.5), 5);
    expect(b).toMatchObject({ label: "dated", mutual: true, myChemistry: 8, theirChemistry: 6, dateId: "d1", rank: 1 });
    const c = r.find((e) => e.personId === "c")!;
    // me is B on date d2 → my chemistry is debriefB
    expect(c.myChemistry).toBe(4);
    expect(c.theirChemistry).toBe(3);
    expect(c.score).toBeCloseTo(100 * (0.5 * 0.4 + 0.3 * 0.3 + 0.2 * 0.9), 5);
    expect(c.mutual).toBe(false);
    const d = r.find((e) => e.personId === "d")!;
    expect(d).toMatchObject({ label: "projected", score: 32, myChemistry: null, dateId: null });
    expect(d.rationale).toMatch(/climbing/);
    expect(r.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("ties break by prescore then id", () => {
    const r = computeRankings({ personId: "me", candidateIds: ["e", "d", "x"], dates: [], prescoreOf: (id) => pre[id] ?? 0.4 });
    expect(r.map((e) => e.personId)).toEqual(["d", "e", "x"]);
  });

  it("AG-15 covers everyone except self: N-1 entries", () => {
    const ids = ["me", "b", "c", "d", "e"];
    const r = computeRankings({ personId: "me", candidateIds: ids, dates: [], prescoreOf: () => 0.3 });
    expect(r).toHaveLength(4);
    expect(r.some((e) => e.personId === "me")).toBe(false);
  });

  it("AG-16 removed person: excluded from candidates → their date is ignored and ranks recomputed", () => {
    const dates = [date("d1", "me", "b", deb(9, true), deb(9, true))];
    const before = computeRankings({ personId: "me", candidateIds: ["b", "c"], dates, prescoreOf: (id) => pre[id] });
    expect(before[0].personId).toBe("b");
    const after = computeRankings({ personId: "me", candidateIds: ["c"], dates, prescoreOf: (id) => pre[id] });
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ personId: "c", rank: 1, label: "projected" });
  });

  it("ignores unfinished dates", () => {
    const d = { ...date("d1", "me", "b", deb(9, true), deb(9, true)), status: "in_progress" as const };
    const r = computeRankings({ personId: "me", candidateIds: ["b"], dates: [d], prescoreOf: () => 0.5 });
    expect(r[0].label).toBe("projected");
  });
});
