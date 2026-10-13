import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApifyQuotaError,
  ScrapeConfigError,
  captureImages,
  pollScrape,
  scrapeNow,
  setApifyClientFactory,
  startScrape,
} from "@/lib/scrape";
import { FakeApify, apiError, fixture, harvestAs, instagramAs, link } from "./helpers";

const LI = "harvestapi/linkedin-profile-scraper";
const LI_FB = "bovi/linkedin-profile-scraper";
const IG = "apify/instagram-profile-scraper";

const jane = link("jsu05", "j.sushie"); // real fixture person
const rahul = link("rahul-mehta-8b2a1", "rahul.climbs"); // real fixture re-labelled

let fake: FakeApify;
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...savedEnv, APIFY_TOKEN: "test-token" };
  delete process.env.MOCK_EXTERNALS;
  delete process.env.APIFY_LINKEDIN_ACTOR;
  delete process.env.APIFY_LINKEDIN_FALLBACK_ACTOR;
  delete process.env.APIFY_INSTAGRAM_ACTOR;
  fake = new FakeApify();
  // The real harvestapi fixture holds 2 duplicate items for jsu05 (deduped by slug).
  fake.datasets.set(LI, [...fixture("linkedin.harvestapi.json"), harvestAs("rahul-mehta-8b2a1", "Rahul")]);
  fake.datasets.set(LI_FB, fixture("linkedin.bovi.json"));
  fake.datasets.set(IG, [...fixture("instagram.profile.json"), instagramAs("rahul.climbs")]);
  setApifyClientFactory(() => fake);
});

afterEach(() => {
  setApifyClientFactory(null);
  process.env = { ...savedEnv };
});

describe("startScrape", () => {
  it("SCR-10 batches all people into exactly one run per platform with verified input shapes", async () => {
    const links = Array.from({ length: 25 }, (_, i) => link(`person-${i}`, `person.${i}`));
    const r = await startScrape(links, { retryDelayMs: 0 });
    expect(fake.starts.map((s) => s.actorId).sort()).toEqual([IG, LI].sort());
    const ig = fake.starts.find((s) => s.actorId === IG)!;
    expect(ig.input).toEqual({ usernames: links.map((l) => l.instagramHandle), includeAboutSection: false });
    expect(ig.options.maxItems).toBe(25);
    const li = fake.starts.find((s) => s.actorId === LI)!;
    // Only `urls` (never `queries`, which duplicates items) and the no-email mode.
    expect(li.input).toEqual({ urls: links.map((l) => l.linkedinUrl), profileScraperMode: "Profile details no email ($4 per 1k)" });
    expect(li.options.maxTotalChargeUsd).toBeGreaterThan(0);
    expect(r).toMatchObject({ linkedinActor: LI, linkedinRunId: expect.any(String), instagramRunId: expect.any(String) });
    expect(Date.parse(r.startedAt)).not.toBeNaN();
  });

  it("SCR-07 falls back to the bovi actor with profileUrls input when the primary keeps failing (500×3)", async () => {
    fake.startErrors.set(LI, [apiError(500, "boom"), apiError(500, "boom"), apiError(500, "boom")]);
    const r = await startScrape([jane], { retryDelayMs: 0 });
    expect(fake.starts.filter((s) => s.actorId === LI)).toHaveLength(3);
    const fb = fake.starts.find((s) => s.actorId === LI_FB)!;
    expect(fb.input).toEqual({ profileUrls: ["https://www.linkedin.com/in/jsu05/"], maxProfiles: 1, disableUsageStats: true });
    expect(r.linkedinActor).toBe(LI_FB);
  });

  it("uses an explicit linkedinActor override (pipeline retry with fallback)", async () => {
    const r = await startScrape([jane], { linkedinActor: LI_FB, retryDelayMs: 0 });
    expect(r.linkedinActor).toBe(LI_FB);
    expect(fake.starts.find((s) => s.actorId === LI_FB)?.input).toHaveProperty("profileUrls");
  });

  it("SCR-08 throws ApifyQuotaError on 402 / usage-limit errors without retrying", async () => {
    fake.startErrors.set(IG, [apiError(402, "Not enough usage to run this paid Actor", "not-enough-usage-to-run-paid-actor")]);
    await expect(startScrape([jane], { retryDelayMs: 0 })).rejects.toBeInstanceOf(ApifyQuotaError);
    expect(fake.starts).toHaveLength(1);

    fake.startErrors.set(IG, [apiError(403, "Monthly usage hard limit exceeded")]);
    await expect(startScrape([jane], { retryDelayMs: 0 })).rejects.toBeInstanceOf(ApifyQuotaError);

    fake.startErrors.set(IG, [apiError(403, "Feature disabled", "platform-feature-disabled")]);
    await expect(startScrape([jane], { retryDelayMs: 0 })).rejects.toBeInstanceOf(ApifyQuotaError);
  });

  it("throws ScrapeConfigError when APIFY_TOKEN is missing (and not in mock mode)", async () => {
    setApifyClientFactory(null);
    delete process.env.APIFY_TOKEN;
    await expect(startScrape([jane])).rejects.toBeInstanceOf(ScrapeConfigError);
  });
});

describe("pollScrape", () => {
  it("SCR-09 returns running without reading datasets, then done; repeat polls are idempotent", async () => {
    fake.statusSeq.set(LI, ["RUNNING", "SUCCEEDED"]);
    fake.statusSeq.set(IG, ["RUNNING", "RUNNING", "SUCCEEDED"]);
    const ref = await startScrape([jane, rahul], { retryDelayMs: 0 });
    expect(await pollScrape(ref, [jane, rahul])).toEqual({ state: "running" });
    expect(await pollScrape(ref, [jane, rahul])).toEqual({ state: "running" });
    expect(fake.listCalls).toHaveLength(0);
    const a = await pollScrape(ref, [jane, rahul]);
    const b = await pollScrape(ref, [jane, rahul]);
    expect(a.state).toBe("done");
    expect(b).toEqual(a);
  });

  it("SCR-10 maps batched results back to people by slug/handle", async () => {
    const ref = await startScrape([rahul, jane], { retryDelayMs: 0 });
    const res = await pollScrape(ref, [rahul, jane]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.linkedinRunFailed).toBe(false);
    expect(res.results.map((r) => [r.links.linkedinSlug, r.linkedin?.fullName, r.instagram?.handle])).toEqual([
      ["rahul-mehta-8b2a1", "Rahul Su", "rahul.climbs"],
      ["jsu05", "Jeff Su", "j.sushie"],
    ]);
    expect(res.results[1].linkedin?.url).toBe("https://www.linkedin.com/in/jsu05");
    expect(res.results[1].linkedin?.experience[0].company).toBe("Sushie Labs");
  });

  it("SCR-04 returns private Instagram profiles with isPrivate: true", async () => {
    fake.datasets.set(IG, fixture("instagram.private.json"));
    const sam = link("sam-lee", "sam.private");
    const ref = await startScrape([sam], { retryDelayMs: 0 });
    const res = await pollScrape(ref, [sam]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.results[0].instagram?.isPrivate).toBe(true);
    expect(res.results[0].instagram?.posts).toEqual([]);
  });

  it("SCR-05 marks not-found Instagram (error item or empty dataset) as instagram null + not_found", async () => {
    const ghost = link("ghost-person", "ghost.notfound.xyz");
    fake.datasets.set(IG, fixture("instagram.notfound.json"));
    let ref = await startScrape([ghost], { retryDelayMs: 0 });
    let res = await pollScrape(ref, [ghost]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.results[0]).toMatchObject({ instagram: null, instagramError: "not_found", linkedin: null, linkedinError: "not_found" });

    fake.datasets.set(IG, []);
    ref = await startScrape([ghost], { retryDelayMs: 0 });
    res = await pollScrape(ref, [ghost]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.results[0]).toMatchObject({ instagram: null, instagramError: "not_found" });
  });

  it("reports linkedinRunFailed when the LinkedIn run fails", async () => {
    fake.statusSeq.set(LI, ["FAILED"]);
    fake.datasets.set(LI, []);
    const ref = await startScrape([jane], { retryDelayMs: 0 });
    const res = await pollScrape(ref, [jane]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.linkedinRunFailed).toBe(true);
    expect(res.results[0]).toMatchObject({ linkedin: null, linkedinError: "run_failed" });
    expect(res.results[0].instagram?.handle).toBe("j.sushie");
  });

  it("returns failed (retryable) when the Instagram run fails", async () => {
    fake.statusSeq.set(IG, ["TIMED-OUT"]);
    fake.datasets.set(IG, []);
    const ref = await startScrape([jane], { retryDelayMs: 0 });
    expect(await pollScrape(ref, [jane])).toMatchObject({ state: "failed", retryable: true });
  });

  it("SCR-08 throws ApifyQuotaError when a run fails because of the usage limit", async () => {
    fake.statusSeq.set(IG, ["FAILED"]);
    fake.statusMessage.set(IG, "Monthly usage limit exceeded, upgrade your plan or wait for the credit reset");
    const ref = await startScrape([jane], { retryDelayMs: 0 });
    await expect(pollScrape(ref, [jane])).rejects.toBeInstanceOf(ApifyQuotaError);
  });

  it("surfaces bovi parse_confidence as linkedinMeta", async () => {
    const ref = await startScrape([jane], { linkedinActor: LI_FB, retryDelayMs: 0 });
    const res = await pollScrape(ref, [jane]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.results[0].linkedinMeta).toMatchObject({ parseConfidence: 1 });
    expect(res.results[0].linkedin?.headline).toBe("Sushie Labs");
  });

  it("dedupes duplicate harvestapi items for the same profile", async () => {
    expect(fixture("linkedin.harvestapi.json")).toHaveLength(2);
    const ref = await startScrape([jane], { retryDelayMs: 0 });
    const res = await pollScrape(ref, [jane]);
    if (res.state !== "done") throw new Error(res.state);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].linkedin?.fullName).toBe("Jeff Su");
  });
});

describe("scrapeNow", () => {
  it("retries missing LinkedIn profiles with the fallback actor", async () => {
    fake.datasets.set(LI, []); // primary returns nothing
    const res = await scrapeNow([jane], { pollIntervalMs: 0, retryDelayMs: 0 });
    expect(fake.starts.map((s) => s.actorId)).toEqual([IG, LI, LI_FB]);
    expect(res[0].linkedin?.actor).toBe(LI_FB);
    expect(res[0].linkedinError).toBeUndefined();
    expect(res[0].instagram?.handle).toBe("j.sushie");
  });
});

describe("mock mode (MOCK_EXTERNALS=1)", () => {
  beforeEach(() => {
    process.env.MOCK_EXTERNALS = "1";
    delete process.env.APIFY_TOKEN;
    setApifyClientFactory(null);
  });

  it("returns deterministic, varied synthetic profiles without network", async () => {
    const a = link("jane-doe", "jane.doe");
    const b = link("omar-haddad", "omar.h");
    const priv = link("pat-q", "pat.private");
    const gone = link("lee-z", "lee.notfound");
    const ref = await startScrape([a, b, priv, gone]);
    expect(ref.linkedinRunId).toMatch(/^mock-/);
    const res = await pollScrape(ref, [a, b, priv, gone]);
    if (res.state !== "done") throw new Error(res.state);
    const [ra, rb, rp, rg] = res.results;
    expect(ra.linkedin?.fullName).toBe("Jane Doe");
    expect(ra.instagram?.posts.length).toBeGreaterThan(0);
    expect(ra.linkedin?.headline).not.toBe(rb.linkedin?.headline);
    expect(rp.instagram?.isPrivate).toBe(true);
    expect(rg).toMatchObject({ instagram: null, instagramError: "not_found" });
    const again = await pollScrape(ref, [a, b, priv, gone]);
    expect(again).toEqual(res);
  });

  it("captureImages returns an SVG avatar and no post images", async () => {
    const res = await pollScrape({ linkedinRunId: "mock-li-x", linkedinActor: "mock", instagramRunId: "mock-ig-x" }, [jane]);
    if (res.state !== "done" || !res.results[0].instagram) throw new Error("expected instagram");
    const cap = await captureImages(res.results[0].instagram);
    expect(cap.images).toEqual([]);
    expect(cap.photoDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(cap.photoDataUrl!.split(",")[1], "base64").toString()).toContain(">JS<");
  });
});
