/**
 * Integration: the whole pipeline on a temp file store with MOCK_EXTERNALS=1
 * (synthetic scrapes + deterministic mock LLM). Covers PIPE-01..PIPE-12.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileStore } from "@/lib/store/file-store";
import { setMutableStore } from "@/lib/store";
import {
  confirmIdentity,
  createPeople,
  hasPendingWork,
  poolStatus,
  recomputeRankings,
  removePerson,
  retryPerson,
  startRound,
  tick,
} from "@/lib/pipeline";
import { FULL_DATE_TURNS, RankingEntry } from "@/lib/contracts";

const POOL = "live";
let dir: string;
let store: FileStore;

async function runToCompletion(maxTicks = 60) {
  for (let i = 0; i < maxTicks; i++) {
    const r = await tick(POOL, { budgetMs: 60_000 });
    if (!r.pendingWork) return r;
  }
  throw new Error("pipeline did not settle");
}

const lines = [
  "https://www.linkedin.com/in/ada-river, https://www.instagram.com/ada.river/",
  "linkedin.com/in/ben-stone | @ben.stone",
  "https://www.instagram.com/cara.lake/, https://www.linkedin.com/in/cara-lake/",
  "https://www.linkedin.com/in/dev-ocean?utm=x, instagram.com/dev.ocean?hl=en",
];

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "agentic-"));
  store = new FileStore(path.join(dir, "db.json"));
  setMutableStore(store);
});
afterAll(() => {
  setMutableStore(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("pipeline (mocked externals)", () => {
  it("PIPE-01/02: accepts valid pairs, reports bad lines and duplicates", async () => {
    const res = await createPeople(POOL, {
      text: [...lines, "https://lnkd.in/abc, @someone", "https://www.linkedin.com/company/acme, @acme"].join("\n"),
    });
    expect(res.accepted).toHaveLength(4);
    expect(res.errors.map((e) => e.code).sort()).toEqual(["linkedin_not_person", "linkedin_shortlink"]);
    const dup = await createPeople(POOL, { text: lines[0] });
    expect(dup.accepted).toHaveLength(0);
    expect(dup.errors[0].code).toBe("duplicate");
  });

  it("PIPE-06: runs queued → ranked for every person", async () => {
    expect(await hasPendingWork(POOL, store)).toBe(true);
    await runToCompletion();
    const people = await store.listPeople(POOL);
    expect(people.every((p) => p.status === "ranked")).toBe(true);
    // Real names come from the scraped profiles, photos are captured.
    expect(people.every((p) => p.photoDataUrl?.startsWith("data:"))).toBe(true);
  });

  it("R4: every profile has needs, hobbies, interests and other qualities with evidence", async () => {
    const profiles = await store.listProfiles(POOL);
    expect(profiles).toHaveLength(4);
    for (const p of profiles) {
      const a = p.analysis;
      for (const list of [a.needs, a.hobbies, a.interests, a.otherQualities]) {
        expect(list.length).toBeGreaterThan(0);
        for (const t of list) {
          expect(t.evidence.length).toBeGreaterThan(0);
          expect(["linkedin", "instagram"]).toContain(t.evidence[0].source);
        }
      }
      expect(p.readingLog.steps.length).toBeGreaterThan(0);
    }
  });

  it("R6: every person went on at least one complete multi-turn date with two debriefs", async () => {
    const people = await store.listPeople(POOL);
    const dates = await store.listDates(POOL);
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect(d.status).toBe("done");
      expect(d.plan?.venue).toBeTruthy();
      expect(d.transcript.length).toBe(FULL_DATE_TURNS);
      expect(new Set(d.transcript.map((t) => t.speaker))).toEqual(new Set(["a", "b"]));
      expect(d.debriefA).toBeTruthy();
      expect(d.debriefB).toBeTruthy();
    }
    for (const p of people) {
      expect(dates.some((d) => d.aId === p.id || d.bId === p.id)).toBe(true);
    }
    // One date per pair.
    const pairs = dates.map((d) => [d.aId, d.bId].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("R7: every person has a full, ordered ranking of everyone else", async () => {
    const people = await store.listPeople(POOL);
    for (const p of people) {
      const r = await store.getRanking(p.id);
      expect(r).toBeTruthy();
      const entries = r!.entries.map((e) => RankingEntry.parse(e));
      expect(entries).toHaveLength(people.length - 1);
      expect(entries.map((e) => e.rank)).toEqual(entries.map((_, i) => i + 1));
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1].score).toBeGreaterThanOrEqual(entries[i].score);
      }
      expect(entries.some((e) => e.personId === p.id)).toBe(false);
    }
  });

  it("PIPE-07/round: another round creates new dates only for unmet pairs", async () => {
    const before = (await store.listDates(POOL)).length;
    const created = await startRound(POOL);
    const after = await store.listDates(POOL);
    expect(after.length).toBe(before + created);
    const pairs = after.map((d) => [d.aId, d.bId].sort().join("|"));
    expect(new Set(pairs).size).toBe(pairs.length);
    await runToCompletion();
  });

  it("R2/PIPE: private Instagram is rejected and never analysed", async () => {
    const res = await createPeople(POOL, {
      text: "https://www.linkedin.com/in/eve-private, https://www.instagram.com/eve.private/",
    });
    expect(res.accepted).toHaveLength(1);
    await runToCompletion();
    const eve = await store.getPerson(res.accepted[0].id);
    expect(eve?.status).toBe("rejected_private");
    expect(await store.getProfile(eve!.id)).toBeNull();
    expect(await store.getSources(eve!.id)).toBeNull();
  });

  it("not-found Instagram is rejected as invalid", async () => {
    const res = await createPeople(POOL, {
      text: "https://www.linkedin.com/in/finn-gone, https://www.instagram.com/finn.notfound/",
    });
    await runToCompletion();
    expect((await store.getPerson(res.accepted[0].id))?.status).toBe("rejected_invalid");
  });

  it("PIPE-12/S1: remove hides the person, purges sources, and drops them from rankings", async () => {
    const people = await store.listPeople(POOL);
    const victim = people.find((p) => p.status === "ranked")!;
    await removePerson(POOL, victim.id);
    expect((await store.listPeople(POOL)).some((p) => p.id === victim.id)).toBe(false);
    expect(await store.getSources(victim.id)).toBeNull();
    for (const p of await store.listPeople(POOL)) {
      const r = await store.getRanking(p.id);
      expect(r?.entries.some((e) => e.personId === victim.id) ?? false).toBe(false);
    }
  });

  it("retry and confirm-identity move people back into the pipeline", async () => {
    const res = await createPeople(POOL, {
      text: "https://www.linkedin.com/in/gia-retry, https://www.instagram.com/gia.retry/",
    });
    const id = res.accepted[0].id;
    await store.updatePerson(id, { status: "failed", error: "boom", attempts: 3 });
    await retryPerson(POOL, id);
    expect((await store.getPerson(id))?.status).toBe("queued");
    await runToCompletion();
    await store.updatePerson(id, { status: "identity_mismatch" });
    await confirmIdentity(POOL, id);
    expect((await store.getPerson(id))?.status).toBe("profiled");
    await runToCompletion();
    expect((await store.getPerson(id))?.status).toBe("ranked");
  });

  it("status payload reflects the pool", async () => {
    const s = await poolStatus(POOL);
    expect(s.pendingWork).toBe(false);
    expect(s.people.length).toBeGreaterThan(3);
    expect(s.dates.done).toBe(s.dates.total);
    expect(await recomputeRankings(POOL)).toBeGreaterThan(0);
  });

  it("concurrent ticks are serialized by the pool lock", async () => {
    await createPeople(POOL, {
      text: "https://www.linkedin.com/in/hal-lock, https://www.instagram.com/hal.lock/",
    });
    const [a, b] = await Promise.all([tick(POOL, { budgetMs: 5_000 }), tick(POOL, { budgetMs: 5_000 })]);
    expect([a.log[0], b.log[0]]).toContain("Another worker is already advancing the agents…");
    await runToCompletion();
  });
});
