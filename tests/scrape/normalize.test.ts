import { describe, expect, it } from "vitest";
import { NormalizedInstagram, NormalizedLinkedIn } from "@/lib/contracts";
import { containsPII, extractHashtags, htmlToText, linkedInParseMeta, normalizeInstagram, normalizeLinkedIn, scrubText } from "@/lib/scrape";
import { fixture, fixtureItem } from "./helpers";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/;

/** Asserts no email/phone survives anywhere in the serialized output (URL/id/timestamp fields excluded). */
function assertNoPII(value: unknown) {
  const text = JSON.stringify(value, (k, v) => (/url$|^id$|^timestamp$/i.test(k) ? undefined : v));
  expect(text).not.toMatch(EMAIL_RE);
  const phones = (text.match(new RegExp(PHONE_RE.source, "g")) ?? []).filter((m) => m.replace(/\D/g, "").length >= 9);
  expect(phones).toEqual([]);
  expect(text).not.toMatch(/wa\.me|businessEmail|businessPhone|businessAddress/);
}

describe("normalizeLinkedIn", () => {
  it("SCR-01 maps the real harvestapi output (primary actor)", () => {
    const li = normalizeLinkedIn(fixture("linkedin.harvestapi.json")[0], "harvestapi/linkedin-profile-scraper");
    expect(NormalizedLinkedIn.safeParse(li).success).toBe(true);
    expect(li).toMatchObject({
      url: "https://www.linkedin.com/in/jsu05",
      fullName: "Jeff Su",
      location: "New York City Metropolitan Area",
      followers: 99626,
      actor: "harvestapi/linkedin-profile-scraper",
    });
    expect(li.headline).toMatch(/^Googler-turned-Educator/);
    expect(li.about).toMatch(/^👋 Hello, I'm Jeff\.\n\n/);
    expect(li.about.length).toBeLessThanOrEqual(2500);
    expect(li.photoUrl).toMatch(/^https:\/\/media\.licdn\.com\/.*profile-displayphoto/);
    expect(li.experience[0]).toMatchObject({ title: "Chief Education Officer", company: "Sushie Labs", dateRange: "Jun 2020 – Present" });
    expect(li.experience[1]).toMatchObject({ title: "Product Marketing Manager", company: "Google", dateRange: "Jul 2018 – Apr 2025" });
    expect(li.education[0]).toEqual({
      school: "Emory University - Goizueta Business School",
      degree: "Bachelor of Business Administration (BBA), Finance, Strategy and Management Consulting",
      dateRange: "2010 - 2014",
    });
    expect(li.skills).toContain("Analytics");
    expect(li.languages).toContain("Cantonese (Native or bilingual proficiency)");
    expect(li.certifications).toContain("Google Analytics Individual Qualification (Google)");
    expect(li.volunteering).toEqual(["English Tutor (HandsOn Hong Kong)"]);
    expect(li.honors[0]).toBe("Beta Gamma Sigma (Emory University)");
    expect(li.activity[0]).toMatch(/^Featured: /);
  });

  it("never maps contact fields (emails, websites, profile actions)", () => {
    const raw = fixtureItem("linkedin.harvestapi.json");
    raw.emails = ["jeff@example.com"];
    const li = normalizeLinkedIn(raw, "harvestapi");
    const out = JSON.stringify(li);
    expect(out).not.toContain("jeff@example.com");
    // `websites` / `profileActions` link (utm_campaign=bio) is contact info and must not be carried over.
    expect(out).not.toContain("utm_campaign=bio");
  });

  it("SCR-02 maps the real bovi output, converts <br> to newlines and surfaces parse_confidence", () => {
    const raw = fixture("linkedin.bovi.json")[0];
    const li = normalizeLinkedIn(raw, "bovi/linkedin-profile-scraper");
    expect(NormalizedLinkedIn.safeParse(li).success).toBe(true);
    expect(li).toMatchObject({ fullName: "Jeff Su", headline: "Sushie Labs", location: "New York City Metropolitan Area", followers: 99626 });
    expect(li.about).toBe("👋 Hello, I'm Jeff.\n\nI started my career as a consultant helping big companies make…");
    expect(li.experience).toEqual([{ title: "", company: "Sushie Labs", dateRange: "", location: "", description: "" }]); // null stubs dropped
    expect(li.education[0]).toMatchObject({ school: "Emory University - Goizueta Business School", dateRange: "2010 – 2014" });
    expect(li.languages).toEqual(["English", "Mandarin", "Cantonese"]);
    expect(linkedInParseMeta(raw)).toEqual({ parseConfidence: 1, parsePath: "jsonld:facebookexternalhit/1.1", warnings: [] });
  });

  it("tolerates an all-null bovi record (OG-only tier)", () => {
    const sparse = {
      profile_url: "https://www.linkedin.com/in/someone",
      name: "Some One",
      headline: null,
      location: null,
      education: null,
      experience: null,
      description: null,
      follower_count: null,
      parse_confidence: 0.6,
      warnings: ["og_only", "no_work_history"],
    };
    const li = normalizeLinkedIn(sparse, "bovi");
    expect(NormalizedLinkedIn.safeParse(li).success).toBe(true);
    expect(li).toMatchObject({ fullName: "Some One", about: "", experience: [], education: [], followers: null });
    expect(linkedInParseMeta(sparse).warnings).toEqual(["og_only", "no_work_history"]);
  });

  it("still maps the (hand-built, unverified) supreme_coder shape", () => {
    const li = normalizeLinkedIn(fixture("linkedin.supreme_coder.json")[0], "supreme_coder/linkedin-profile-scraper");
    expect(li).toMatchObject({ fullName: "Jane Doe", location: "London, England, United Kingdom", followers: 2814 });
    expect(li.experience[0]).toMatchObject({ title: "Senior Product Designer", company: "Lumen Health", dateRange: "Mar 2022 – Present" });
    expect(li.education[0].degree).toBe("MA, Service Design");
  });

  it("never throws on garbage input", () => {
    for (const raw of [null, undefined, 42, "x", [], { experience: "nope", skills: [null, 3] }]) {
      expect(NormalizedLinkedIn.safeParse(normalizeLinkedIn(raw, "x", "https://www.linkedin.com/in/x")).success).toBe(true);
    }
  });

  it("trims long text and caps experiences", () => {
    const raw = {
      firstName: "A",
      lastName: "B",
      about: "word ".repeat(1000),
      experience: Array.from({ length: 20 }, (_, i) => ({ position: `Role ${i}`, companyName: "Co" })),
    };
    const li = normalizeLinkedIn(raw, "x");
    expect(li.about.length).toBeLessThanOrEqual(2500);
    expect(li.experience).toHaveLength(12);
  });

  it("htmlToText handles tags and entities", () => {
    expect(htmlToText("a<br>b<br/>c &amp; d<p>e</p>&#39;f&#x27;")).toBe("a\nb\nc & de\n'f'");
  });
});

describe("normalizeInstagram", () => {
  it("SCR-03 maps the real profile output (≤12 posts with caption/hashtags/location/timestamp/imageUrl)", () => {
    const ig = normalizeInstagram(fixture("instagram.profile.json")[0], "apify/instagram-profile-scraper");
    expect(NormalizedInstagram.safeParse(ig).success).toBe(true);
    expect(ig).toMatchObject({
      handle: "j.sushie",
      url: "https://www.instagram.com/j.sushie/",
      fullName: "Jeff Su",
      followers: 85458,
      following: 701,
      postsCount: 292,
      isPrivate: false,
      isVerified: true,
      category: "Education",
    });
    expect(ig.biography).toMatch(/Googler-turned-educator/);
    expect(ig.externalUrls[0]).toMatch(/^https:\/\/www\.jeffsu\.org\/links/);
    expect(ig.externalUrls.some((u) => u.includes("l.instagram.com"))).toBe(false);
    expect(ig.profilePicUrl).toMatch(/cdninstagram/);
    expect(ig.posts).toHaveLength(12);
    expect(ig.posts[0]).toMatchObject({
      id: "3409862939533317840",
      url: "https://www.instagram.com/p/C9SREb7pxbQ/",
      type: "Image",
      mentions: ["google"],
      location: "Google  Mountain View California",
      timestamp: "2024-07-11T14:16:00.000Z",
      likes: 2115,
      comments: 68,
    });
    expect(ig.posts[0].imageUrl).toMatch(/^https:\/\/scontent/);
    expect(ig.posts[1].hashtags).toEqual(["career", "careertips", "peopleoperations", "promotionatwork"]);
    expect(ig.posts[2].type).toBe("Sidecar");
    expect(ig.posts.every((p) => p.caption.length <= 600)).toBe(true);
  });

  it("caps posts at 12, extracts hashtags when missing, hides -1 like counts, matches usernames case-insensitively", () => {
    const raw = fixtureItem("instagram.profile.json");
    const posts = raw.latestPosts as Record<string, unknown>[];
    posts[0].hashtags = undefined;
    posts[0].caption = "Sunday long run #trailrunning #nyc";
    posts[0].likesCount = -1;
    raw.latestPosts = [...posts, ...posts].map((p, i) => ({ ...p, id: `p${i}` }));
    raw.username = "J.Sushie";
    const ig = normalizeInstagram(raw, "x");
    expect(ig.handle).toBe("j.sushie");
    expect(ig.posts).toHaveLength(12);
    expect(ig.posts[0].hashtags).toEqual(["trailrunning", "nyc"]);
    expect(ig.posts[0].likes).toBeNull();
  });

  it("keeps isPrivate: true and drops posts for private accounts", () => {
    const ig = normalizeInstagram(fixture("instagram.private.json")[0], "apify/instagram-profile-scraper");
    expect(ig.isPrivate).toBe(true);
    expect(ig.posts).toEqual([]);
  });
});

describe("SCR-06 PII stripping", () => {
  it("removes emails, phones and DM links from normalized output even when present in raw", () => {
    const li = fixtureItem("linkedin.harvestapi.json");
    li.about = `${String(li.about)}\nReach me at jeff@example.com or +1 (415) 555-0132.`;
    li.emails = ["jeff@example.com"];
    const ig = fixtureItem("instagram.profile.json");
    ig.biography = "Educator 📧 hello@jeffsu.example ☎️ +44 20 7946 0958";
    ig.businessEmail = "hello@jeffsu.example";
    ig.businessPhoneNumber = "+442079460958";
    ig.businessAddress = { street_address: "1 Example St" };
    ig.externalUrls = [...(ig.externalUrls as unknown[]), { title: "WhatsApp", url: "https://wa.me/447700900123" }];
    (ig.latestPosts as Record<string, unknown>[])[0].caption = "DM me or text 07700 900456. Email run@club.example";

    const nli = normalizeLinkedIn(li, "harvestapi");
    const nig = normalizeInstagram(ig, "apify/instagram-profile-scraper");
    assertNoPII(nli);
    assertNoPII(nig);
    expect(nig.biography).toMatch(/^Educator \[removed\]/);
    expect(nli.about).toMatch(/Hello, I'm Jeff/);
  });

  it("scrubText keeps years, counts and ordinary numbers", () => {
    expect(scrubText("Worked 2015 - 2020 and 2019–2023, ran 42.2 km, 1,200 followers")).toBe(
      "Worked 2015 - 2020 and 2019–2023, ran 42.2 km, 1,200 followers",
    );
    expect(scrubText("Call me on (415) 555-0132 or mail me: x.y@z.io; whatsapp wa.me/14155550132")).not.toMatch(/555|x\.y@|wa\.me/);
    expect(scrubText("jane [at] gmail [dot] com")).toBe("[removed]");
    expect(containsPII("hello@x.com")).toBe(true);
    expect(containsPII("hello world")).toBe(false);
  });

  it("extractHashtags handles unicode", () => {
    expect(extractHashtags("Café time #café #2026goals #run_club")).toEqual(["café", "2026goals", "run_club"]);
  });
});
