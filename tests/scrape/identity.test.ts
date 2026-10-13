import { describe, expect, it } from "vitest";
import { identitySignals, normalizeInstagram, normalizeLinkedIn } from "@/lib/scrape";
import { fixture, fixtureItem } from "./helpers";

const li = () => normalizeLinkedIn(fixture("linkedin.harvestapi.json")[0], "harvestapi");

describe("identitySignals (SCR-12)", () => {
  it("real pair: names overlap, no LinkedIn link in the Instagram bio", () => {
    const ig = normalizeInstagram(fixture("instagram.profile.json")[0], "apify/instagram-profile-scraper");
    const s = identitySignals(li(), ig);
    expect(s.nameMatch).toBe(true);
    expect(s.externalLink).toBe(false);
  });

  it("detects an Instagram external link pointing at the LinkedIn slug", () => {
    const raw = fixtureItem("instagram.profile.json");
    raw.externalUrls = [{ title: "LinkedIn", url: "https://www.linkedin.com/in/jsu05/" }];
    expect(identitySignals(li(), normalizeInstagram(raw, "x")).externalLink).toBe(true);
  });

  it("also finds a LinkedIn URL written in the bio text, and ignores other people's slugs", () => {
    const ig = normalizeInstagram({ username: "j.sushie", biography: "educator · in.linkedin.com/in/JSU05" }, "x");
    expect(identitySignals(li(), ig).externalLink).toBe(true);
    const other = normalizeInstagram({ username: "x", fullName: "Ann Lee", biography: "linkedin.com/in/someone-else" }, "x");
    expect(identitySignals(li(), other)).toMatchObject({ externalLink: false, nameMatch: false });
  });
});
