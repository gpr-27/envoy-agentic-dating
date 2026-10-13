import { describe, expect, it } from "vitest";
import { parsePeopleInput } from "@/lib/scrape";

describe("parsePeopleInput", () => {
  it("parses separators in either order, optional name, comments and blank lines", () => {
    const text = [
      "# my list",
      "",
      "https://www.linkedin.com/in/jane-doe/, @jane.doe",
      "@sam.lee | linkedin.com/in/sam-lee | Sam Lee",
      "linkedin.com/in/ana-ruiz\tana.ruiz",
      "in.linkedin.com/in/raj-k ; https://instagram.com/raj.k/ ; Raj K",
      "linkedin.com/in/mo-ali @mo.ali Mo Ali",
    ].join("\n");
    const r = parsePeopleInput({ text });
    expect(r.errors).toEqual([]);
    expect(r.accepted.map((p) => [p.linkedinSlug, p.instagramHandle, p.name])).toEqual([
      ["jane-doe", "jane.doe", undefined],
      ["sam-lee", "sam.lee", "Sam Lee"],
      ["ana-ruiz", "ana.ruiz", undefined],
      ["raj-k", "raj.k", "Raj K"],
      ["mo-ali", "mo.ali", "Mo Ali"],
    ]);
    expect(r.accepted[0]).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane-doe",
      instagramUrl: "https://www.instagram.com/jane.doe/",
    });
  });

  it("accepts CSV with a header row (quoted fields, gender/seeking)", () => {
    const text = [
      "name,linkedin_url,instagram_url,gender,seeking",
      '"Doe, Jane",https://www.linkedin.com/in/jane-doe,https://www.instagram.com/jane.doe/,woman,men',
      "Sam Lee,linkedin.com/in/sam-lee,@sam.lee,,",
    ].join("\n");
    const r = parsePeopleInput({ text });
    expect(r.errors).toEqual([]);
    expect(r.accepted[0]).toMatchObject({ name: "Doe, Jane", linkedinSlug: "jane-doe", gender: "woman", seeking: "men" });
    expect(r.accepted[1]).toMatchObject({ name: "Sam Lee", instagramHandle: "sam.lee" });
    expect(r.accepted[1].gender).toBeUndefined();
  });

  it("accepts structured people[] with gender/seeking", () => {
    const r = parsePeopleInput({
      people: [{ linkedin: "linkedin.com/in/jane-doe", instagram: "@jane.doe", name: "Jane", gender: "woman", seeking: "everyone" }],
    });
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]).toMatchObject({ name: "Jane", gender: "woman", seeking: "everyone" });
  });

  it("URL-10 flags duplicates within the input and against the existing pool", () => {
    const r = parsePeopleInput(
      { text: "linkedin.com/in/jane-doe, @jane.doe\nhttps://www.linkedin.com/in/jane-doe/, @someone.else\nlinkedin.com/in/sam-lee, @sam.lee" },
      { existing: [{ linkedinUrl: "https://www.linkedin.com/in/sam-lee", instagramHandle: "sam.lee" }] },
    );
    expect(r.accepted.map((p) => p.linkedinSlug)).toEqual(["jane-doe"]);
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [2, "duplicate"],
      [3, "duplicate"],
    ]);
    expect(r.errors[0].message).toMatch(/listed twice/);
    expect(r.errors[1].message).toMatch(/already in this pool/);
  });

  it("URL-11 rejects more than 30 people with a single bulk_limit error and no partial processing", () => {
    const text = Array.from({ length: 31 }, (_, i) => `linkedin.com/in/person-${i}, @person.${i}`).join("\n");
    const r = parsePeopleInput({ text });
    expect(r.accepted).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].code).toBe("bulk_limit");
    expect(parsePeopleInput({ text: text.split("\n").slice(0, 30).join("\n") }).accepted).toHaveLength(30);
    expect(parsePeopleInput({ text }, { max: 40 }).accepted).toHaveLength(31);
  });

  it("URL-12 accepts good lines and reports bad lines individually", () => {
    const text = [
      "linkedin.com/in/a-one, @a.one",
      "https://www.linkedin.com/company/acme, @acme",
      "linkedin.com/in/b-two, @b.two",
      "linkedin.com/in/c-three, https://www.instagram.com/p/XYZ/",
      "linkedin.com/in/d-four, @d.four",
    ].join("\n");
    const r = parsePeopleInput({ text });
    expect(r.accepted.map((p) => p.linkedinSlug)).toEqual(["a-one", "b-two", "d-four"]);
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [2, "linkedin_not_person"],
      [4, "instagram_not_profile"],
    ]);
    expect(r.errors[0].message).toMatch(/company page/);
  });

  it("reports missing halves", () => {
    const r = parsePeopleInput({ text: "linkedin.com/in/only-li\n@only.ig" });
    expect(r.errors.map((e) => [e.line, e.code])).toEqual([
      [1, "instagram_empty"],
      [2, "linkedin_empty"],
    ]);
  });
});
