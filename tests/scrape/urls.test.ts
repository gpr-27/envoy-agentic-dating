import { describe, expect, it } from "vitest";
import { canonicalizeInstagram, canonicalizeLinkedIn } from "@/lib/scrape";

const CANON = "https://www.linkedin.com/in/jane-doe";

describe("canonicalizeLinkedIn", () => {
  it("URL-01 strips trailing slash and keeps www host", () => {
    expect(canonicalizeLinkedIn("https://www.linkedin.com/in/jane-doe/")).toEqual({ ok: true, url: CANON, slug: "jane-doe" });
  });

  it("URL-02 accepts missing scheme and strips query/fragment", () => {
    expect(canonicalizeLinkedIn("linkedin.com/in/jane-doe?utm=x#top")).toMatchObject({ ok: true, url: CANON });
    expect(canonicalizeLinkedIn("  www.linkedin.com/in/Jane-Doe/?originalSubdomain=uk  ")).toMatchObject({ ok: true, url: CANON });
    expect(canonicalizeLinkedIn("http://m.linkedin.com/in/jane-doe")).toMatchObject({ ok: true, url: CANON });
  });

  it("URL-03 normalises locale subdomains to www", () => {
    expect(canonicalizeLinkedIn("https://in.linkedin.com/in/jane-doe")).toMatchObject({ ok: true, url: CANON });
    expect(canonicalizeLinkedIn("https://uk.linkedin.com/in/jane-doe/")).toMatchObject({ ok: true, url: CANON });
  });

  it("decodes URL-encoded slugs and lowercases", () => {
    const r = canonicalizeLinkedIn("https://www.linkedin.com/in/Jos%C3%A9-Garc%C3%ADa-12ab/");
    expect(r).toEqual({ ok: true, slug: "josé-garcía-12ab", url: "https://www.linkedin.com/in/josé-garcía-12ab" });
  });

  it("ignores sub-pages of a profile", () => {
    expect(canonicalizeLinkedIn("https://www.linkedin.com/in/jane-doe/details/experience/")).toMatchObject({ ok: true, url: CANON });
  });

  it("URL-04 rejects lnkd.in short links", () => {
    const r = canonicalizeLinkedIn("https://lnkd.in/abc");
    expect(r).toMatchObject({ ok: false, code: "linkedin_shortlink" });
  });

  it("URL-05 rejects company/school/showcase/feed/posts pages with a friendly message", () => {
    const r = canonicalizeLinkedIn("https://www.linkedin.com/company/acme");
    expect(r).toMatchObject({ ok: false, code: "linkedin_not_person" });
    if (!r.ok) expect(r.message).toMatch(/company page.*linkedin\.com\/in\/jane-doe/);
    for (const p of ["school/mit", "showcase/acme-ai", "feed/", "posts/jane-doe_activity-123"]) {
      expect(canonicalizeLinkedIn(`https://www.linkedin.com/${p}`)).toMatchObject({ ok: false, code: "linkedin_not_person" });
    }
  });

  it("URL-06 rejects legacy /pub/ URLs", () => {
    expect(canonicalizeLinkedIn("https://www.linkedin.com/pub/jane/1/2/3")).toMatchObject({ ok: false, code: "linkedin_legacy_url" });
  });

  it("rejects empty and non-URLs", () => {
    expect(canonicalizeLinkedIn("   ")).toMatchObject({ ok: false, code: "linkedin_empty" });
    expect(canonicalizeLinkedIn("jane doe")).toMatchObject({ ok: false, code: "linkedin_not_url" });
    expect(canonicalizeLinkedIn("https://example.com/in/jane")).toMatchObject({ ok: false, code: "linkedin_not_url" });
    expect(canonicalizeLinkedIn("@jane.doe")).toMatchObject({ ok: false, code: "linkedin_not_url" });
  });
});

describe("canonicalizeInstagram", () => {
  it("URL-07 accepts @handle, bare handle and URL variants", () => {
    const inputs = [
      "@jane.doe",
      "jane.doe",
      "Jane.Doe",
      "https://instagram.com/jane.doe/",
      "https://www.instagram.com/jane.doe?hl=en",
      "instagram.com/jane.doe/?igsh=MWx4eTJ2",
      "https://m.instagram.com/jane.doe",
      "https://instagr.am/jane.doe",
      "http://www.instagram.com/jane.doe/#",
    ];
    for (const i of inputs) {
      expect(canonicalizeInstagram(i), i).toEqual({ ok: true, handle: "jane.doe", url: "https://www.instagram.com/jane.doe/" });
    }
  });

  it("URL-08 rejects posts, reels, stories, explore and tv links", () => {
    for (const p of ["p/XYZ/", "reel/ABC/", "reels/ABC", "stories/jane.doe/123/", "explore/tags/run/", "tv/XYZ"]) {
      expect(canonicalizeInstagram(`https://www.instagram.com/${p}`), p).toMatchObject({ ok: false, code: "instagram_not_profile" });
    }
  });

  it("URL-09 rejects invalid handles", () => {
    for (const h of ["jane doe!", "a".repeat(31), ".jane", "jane.", "ja..ne", "jane-doe"]) {
      expect(canonicalizeInstagram(h), h).toMatchObject({ ok: false, code: "instagram_invalid_handle" });
    }
    expect(canonicalizeInstagram("a".repeat(30))).toMatchObject({ ok: true });
  });

  it("rejects empty and non-Instagram links", () => {
    expect(canonicalizeInstagram("")).toMatchObject({ ok: false, code: "instagram_empty" });
    const r = canonicalizeInstagram("https://www.linkedin.com/in/jane-doe");
    expect(r).toMatchObject({ ok: false, code: "instagram_not_profile" });
    if (!r.ok) expect(r.message).toMatch(/LinkedIn link in the Instagram slot/);
  });
});
