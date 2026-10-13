import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileAnalysis } from "@/lib/contracts";
import { compatible, pairKey, pickDates, prescore, type PoolMember } from "@/lib/agents";
import { analyse } from "./helpers";
import { ALL, analysis } from "./fixtures";

let pool: PoolMember[];

beforeAll(async () => {
  pool = [];
  for (const [id, b] of Object.entries(ALL)) pool.push({ id, analysis: await analyse(b), gender: "unspecified", seeking: "everyone" });
});

describe("Matchmaker", () => {
  it("AG-13 prescore: in [0,1], symmetric, identical = 1, overlap beats no overlap", () => {
    for (const x of pool)
      for (const y of pool) {
        const s = prescore(x.analysis, y.analysis).score;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        expect(s).toBeCloseTo(prescore(y.analysis, x.analysis).score, 10);
      }
    const a = analysis("Ann", { hobbies: ["Climbing", "Coffee"], values: ["Honesty"], needs: ["Someone outdoorsy"] });
    expect(prescore(a, a).score).toBe(1);
    const close = analysis("Bo", { hobbies: ["Climbing", "Baking"], values: ["Honesty"] });
    const far = analysis("Cy", { hobbies: ["Opera"], interests: ["Tax law"], values: ["Tradition"], needs: ["Someone formal"] });
    expect(prescore(a, close).score).toBeGreaterThan(prescore(a, far).score);
    expect(prescore(a, close).reasons.join(" ")).toMatch(/climbing/i);
  });

  it("prescore: complementarity bonus and dealbreaker penalty", () => {
    const base = { hobbies: ["Reading"], values: ["Honesty"] };
    const intro = analysis("I", { ...base, personality: ["Quiet introvert"] });
    const extro = analysis("E", { ...base, personality: ["Outgoing extrovert"] });
    const intro2 = analysis("J", { ...base, personality: ["Quiet introvert"] });
    expect(prescore(intro, extro).reasons.join()).toMatch(/Complementary/);
    const picky = analysis("P", { ...base, dealbreakers: ["Smoking"] });
    const smoker = analysis("S", { ...base, personality: ["Smoking enthusiast"] });
    const non = analysis("N", { ...base, personality: ["Gardening enthusiast"] });
    expect(prescore(picky, smoker).score).toBeLessThan(prescore(picky, non).score);
    expect(prescore(intro, extro).score).toBeGreaterThan(0);
    expect(prescore(intro, intro2).score).toBeGreaterThan(0);
  });

  it("compatible respects seeking preferences", () => {
    expect(compatible({ gender: "woman", seeking: "men" }, { gender: "man", seeking: "women" })).toBe(true);
    expect(compatible({ gender: "woman", seeking: "men" }, { gender: "woman", seeking: "women" })).toBe(false);
    expect(compatible({ gender: "woman", seeking: "women" }, { gender: "woman", seeking: "everyone" })).toBe(true);
    expect(compatible({ gender: "unspecified", seeking: "everyone" }, { gender: "man", seeking: "women" })).toBe(true);
    expect(compatible({ gender: "nonbinary", seeking: "everyone" }, { gender: "man", seeking: "women" })).toBe(false);
  });

  it("AG-11 pool of 5, K=3: deduped, no self pairs, everyone ≥1 date, deterministic", () => {
    const picks = pickDates(pool, { k: 3, existingPairs: new Set() });
    const keys = picks.map((p) => pairKey(p.aId, p.bId));
    expect(new Set(keys).size).toBe(keys.length);
    expect(picks.every((p) => p.aId !== p.bId)).toBe(true);
    for (const p of pool) expect(picks.some((x) => x.aId === p.id || x.bId === p.id)).toBe(true);
    expect(pickDates([...pool].reverse(), { k: 3, existingPairs: new Set() })).toEqual(picks);
    expect(picks.every((p) => p.matchReason.includes("asked") && p.prescore >= 0 && p.prescore <= 1)).toBe(true);
  });

  it("existing pairs are not recreated; focusIds limits new dates to newcomers", () => {
    const first = pickDates(pool, { k: 1, existingPairs: new Set() });
    const existing = new Set(first.map((p) => pairKey(p.aId, p.bId)));
    const again = pickDates(pool, { k: 1, existingPairs: existing });
    expect(again.filter((p) => existing.has(pairKey(p.aId, p.bId)))).toHaveLength(0);
    const focused = pickDates(pool, { k: 2, existingPairs: new Set(), focusIds: ["kai"] });
    expect(focused.length).toBeGreaterThan(0);
    expect(focused.every((p) => p.aId === "kai" || p.bId === "kai")).toBe(true);
  });

  it("lonely-node fix-up: someone nobody picks still gets a date", () => {
    const hot = (id: string): PoolMember => ({ id, analysis: analysis(id, { hobbies: ["Climbing"], values: ["Honesty"] }), gender: "unspecified", seeking: "everyone" });
    const loner: PoolMember = { id: "zed", analysis: analysis("Zed", { hobbies: ["Opera"], values: ["Tradition"], needs: ["Formal"] }), gender: "unspecified", seeking: "everyone" };
    const picks = pickDates([hot("a1"), hot("a2"), hot("a3"), loner], { k: 1, existingPairs: new Set(), focusIds: ["a1", "a2", "a3", "zed"] });
    expect(picks.some((p) => p.aId === "zed" || p.bId === "zed")).toBe(true);
  });

  it("AG-12 pool of 2 → one date; pool of 1 → none; incompatible pair → none", () => {
    expect(pickDates(pool.slice(0, 2), { k: 3, existingPairs: new Set() })).toHaveLength(1);
    expect(pickDates(pool.slice(0, 1), { k: 3, existingPairs: new Set() })).toHaveLength(0);
    const w = (id: string, a: ProfileAnalysis): PoolMember => ({ id, analysis: a, gender: "woman", seeking: "men" });
    expect(pickDates([w("x", pool[0].analysis), w("y", pool[1].analysis)], { k: 3, existingPairs: new Set() })).toHaveLength(0);
  });
});
