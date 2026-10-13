/**
 * Tolerant mapping from any supported LinkedIn actor item to {@link NormalizedLinkedIn}.
 * Covers harvestapi (verified against a real run), bovi (snake_case, JSON-LD
 * derived, verified), supreme_coder (camelCase, curious_coder lineage, unverified)
 * and common alternates. Only public profile fields are kept (never `emails`,
 * `websites`, `profileActions`, contact info) and all free text is HTML-stripped
 * and PII-scrubbed.
 */
import { NormalizedLinkedIn } from "@/lib/contracts";
import { scrubText } from "./pii";
import { canonicalizeLinkedIn } from "./urls";
import { asArr, asObj, clip, htmlToText, isObj, pickArr, pickNum, pickStr, pickVal, str, uniq, type Obj } from "./util";

/** Text limits applied during normalisation. */
export const LI_LIMITS = { about: 2500, headline: 300, expDescription: 600, maxExperience: 12, maxEducation: 8, maxList: 40, activity: 600, maxActivity: 10 } as const;

type Experience = NormalizedLinkedIn["experience"][number];
type Education = NormalizedLinkedIn["education"][number];

const t = (s: string, max = 300) => clip(scrubText(htmlToText(s)), max);

/** Formats {year, month} / "2020-05" / 2020 / ISO dates into a short label. */
function fmtDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    const iso = v.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${MONTHS[Number(iso[2]) - 1] ?? ""} ${iso[1]}`.trim();
    return v.trim();
  }
  const o = asObj(v);
  const text = pickStr(o, "text"); // harvestapi: { month: "Jun", year: 2020, text: "Jun 2020" }
  if (text) return text;
  const year = str(o.year);
  const month = Number(o.month);
  if (!year) return pickStr(o, "text", "date");
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : year;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateRange(o: Obj): string {
  const direct = pickStr(o, "dateRange", "date_range", "dates", "caption", "period", "timePeriod.text", "date");
  if (direct && !/^\d+$/.test(direct)) return direct;
  const duration = pickStr(o, "duration"); // "6 yrs 5 mos" — last resort only
  const tp = asObj(pickVal(o, "timePeriod", "time_period", "dateRangeObj"));
  const start = fmtDate(pickVal(o, "start", "startDate", "start_date", "starts_at", "startedOn", "from") ?? tp.startDate ?? tp.start);
  const endRaw = pickVal(o, "end", "endDate", "end_date", "ends_at", "endedOn", "to") ?? tp.endDate ?? tp.end;
  const endKeys = ["end", "endDate", "end_date", "ends_at", "endedOn", "to"];
  // bovi: `end: null` = current; LinkedIn timePeriod: startDate without endDate = current.
  const explicitOpenEnd = endKeys.some((k) => k in o && o[k] === null) || (tp.startDate !== undefined && (tp.endDate === undefined || tp.endDate === null));
  const current = o.current === true || o.isCurrent === true || o.is_current === true || explicitOpenEnd;
  const end = fmtDate(endRaw) || (start && current ? "Present" : "");
  if (start && end) return `${start} – ${end}`;
  return start || end || direct || duration;
}

function companyName(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return pickStr(asObj(v), "name", "companyName", "title");
}

function mapExperience(raw: unknown): Experience | null {
  if (typeof raw === "string") return raw.trim() ? { title: t(raw, 200), company: "", dateRange: "", location: "", description: "" } : null;
  const o = asObj(raw);
  const title = pickStr(o, "title", "position", "jobTitle", "job_title", "role", "subtitle_title");
  const company =
    pickStr(o, "companyName", "company_name", "subtitle", "organization", "employer") ||
    companyName(o.company) ||
    (title ? "" : pickStr(o, "name")); // bovi: {name, url, start, end} = company stub
  const exp: Experience = {
    title: t(title, 200),
    company: t(company.split(" · ")[0] ?? company, 200),
    dateRange: t(dateRange(o), 120),
    location: t(pickStr(o, "location", "locationName", "location_name", "geo"), 120),
    description: t(pickStr(o, "description", "summary", "details"), LI_LIMITS.expDescription),
  };
  return exp.title || exp.company ? exp : null;
}

/** Some actors group several roles under one company (`positions[].positions[]`). */
function flattenExperience(list: unknown[]): unknown[] {
  return list.flatMap((item) => {
    const o = asObj(item);
    const nested = pickArr(o, "positions", "roles", "subComponents");
    if (!nested.length) return [item];
    const company = pickStr(o, "companyName", "company_name", "title", "name") || companyName(o.company);
    return nested.map((n) => ({ companyName: company, ...asObj(n) }));
  });
}

function mapEducation(raw: unknown): Education | null {
  if (typeof raw === "string") return raw.trim() ? { school: t(raw, 200), degree: "", dateRange: "" } : null;
  const o = asObj(raw);
  const school = pickStr(o, "schoolName", "school_name", "school", "title", "name", "institution") || companyName(o.school);
  const degreeParts = uniq([pickStr(o, "degreeName", "degree_name", "degree", "subtitle"), pickStr(o, "fieldOfStudy", "field_of_study", "field")].filter(Boolean));
  const ed: Education = { school: t(school, 200), degree: t(degreeParts.join(", "), 200), dateRange: t(dateRange(o), 120) };
  return ed.school ? ed : null;
}

/** Maps an array of strings/objects to short labels using the first matching key. */
function labels(list: unknown[], keys: string[], extra?: (o: Obj) => string): string[] {
  const out = list.map((item) => {
    if (typeof item === "string") return item;
    const o = asObj(item);
    const base = pickStr(o, ...keys);
    const more = extra?.(o) ?? "";
    return more && base ? `${base} (${more})` : base;
  });
  return uniq(out.map((s) => t(s, 160)).filter(Boolean)).slice(0, LI_LIMITS.maxList);
}

function locationOf(o: Obj): string {
  const loc = pickVal(o, "location", "geoLocationName", "geo_location_name", "addressWithCountry", "locationName", "city");
  if (typeof loc === "string") return loc.trim();
  if (isObj(loc)) {
    const s = pickStr(loc, "default", "full", "linkedinText", "text", "name");
    if (s) return s;
    return [pickStr(loc, "city"), pickStr(loc, "state"), pickStr(loc, "country", "countryName")].filter(Boolean).join(", ");
  }
  return [pickStr(o, "city"), pickStr(o, "geoCountryName", "country_full_name", "countryName", "country")].filter(Boolean).join(", ");
}

function fullNameOf(o: Obj): string {
  const direct = pickStr(o, "fullName", "full_name", "name", "fullname");
  if (direct) return direct;
  return [pickStr(o, "firstName", "first_name"), pickStr(o, "lastName", "last_name")].filter(Boolean).join(" ");
}

function photoOf(o: Obj): string | null {
  const v = pickVal(o, "photo_url", "photoUrl", "photo", "profilePicHighQuality", "profilePicture", "profilePic", "pictureUrl", "profile_picture", "profile_pic_url", "profilePictureUrl", "avatar", "image", "img");
  if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  if (isObj(v)) {
    const u = pickStr(v, "url", "src");
    if (u) return u;
    const sizes = asArr(pickVal(v, "sizes", "artifacts"));
    const last = asObj(sizes[sizes.length - 1]);
    const lu = pickStr(last, "url", "fileIdentifyingUrlPathSegment");
    if (/^https?:\/\//.test(lu)) return lu;
  }
  return null;
}

/** Finds the public profile URL the item refers to, canonicalised when possible. */
export function linkedInItemUrl(o: Obj): string {
  for (const k of ["profile_url", "profileUrl", "linkedinUrl", "linkedin_url", "url", "inputUrl", "input_url", "originalUrl", "publicProfileUrl", "public_profile_url"]) {
    const v = str(o[k]);
    if (!v) continue;
    const c = canonicalizeLinkedIn(v);
    if (c.ok) return c.url;
  }
  const id = pickStr(o, "publicIdentifier", "public_identifier", "slug", "username", "vanityName");
  return id ? `https://www.linkedin.com/in/${id.toLowerCase()}` : "";
}

function activityOf(o: Obj): string[] {
  const textOf = (p: unknown) => {
    if (typeof p === "string") return p;
    const q = asObj(p);
    const title = pickStr(q, "text", "headline", "title", "content", "commentary", "name");
    const desc = pickStr(q, "description", "subtitle");
    return desc && title && desc !== title ? `${title} — ${desc}` : title || desc;
  };
  const lists = [
    pickArr(o, "recent_posts", "recentPosts", "posts", "activity", "activities", "articles"),
    pickArr(o, "publications").map((p) => `Publication: ${textOf(p)}`),
    pickArr(o, "projects").map((p) => `Project: ${textOf(p)}`),
    asArr(asObj(o.featured).slides).map((p) => `Featured: ${textOf(p)}`),
  ];
  return uniq(
    lists
      .flat()
      .map((p) => (typeof p === "string" ? p : textOf(p)))
      .filter((s) => s && !/^(?:Publication|Project|Featured): $/.test(s))
      .map((s) => t(s, LI_LIMITS.activity))
      .filter(Boolean),
  ).slice(0, LI_LIMITS.maxActivity);
}

/**
 * Normalises one raw LinkedIn actor item. Never throws; unknown shapes yield an
 * almost-empty profile. `fallbackUrl` is used when the item carries no URL.
 */
export function normalizeLinkedIn(raw: unknown, actor: string, fallbackUrl = ""): NormalizedLinkedIn {
  const o = asObj(raw);
  const expList = flattenExperience(pickArr(o, "experience", "experiences", "positions", "position", "workExperience", "work_experience", "jobs"));
  let experience = expList.map(mapExperience).filter((e): e is Experience => e !== null);
  if (!experience.length) {
    const title = pickStr(o, "job_title", "jobTitle", "currentJobTitle", "occupation");
    const company = companyName(pickVal(o, "current_company", "currentCompany", "companyName", "company_name", "company"));
    if (title || company) experience = [{ title: t(title, 200), company: t(company, 200), dateRange: "Present", location: "", description: "" }];
  }
  const eduList = pickArr(o, "education", "educations", "schools");
  const headline = pickStr(o, "headline", "occupation", "sub_title", "subTitle", "tagline", "job_title");

  return NormalizedLinkedIn.parse({
    url: linkedInItemUrl(o) || fallbackUrl,
    fullName: t(fullNameOf(o), 120),
    headline: t(headline, LI_LIMITS.headline),
    about: t(pickStr(o, "about", "summary", "description", "bio"), LI_LIMITS.about),
    location: t(locationOf(o), 120),
    photoUrl: photoOf(o),
    followers: pickNum(o, "followers", "followerCount", "follower_count", "followersCount", "followers_count"),
    experience: experience.slice(0, LI_LIMITS.maxExperience),
    education: eduList.map(mapEducation).filter((e): e is Education => e !== null).slice(0, LI_LIMITS.maxEducation),
    skills: labels([...pickArr(o, "skills", "skillsList"), ...pickArr(o, "topSkills")], ["name", "title", "skill"]),
    languages: labels(pickArr(o, "languages"), ["name", "language", "title"], (l) => pickStr(l, "proficiency")),
    certifications: labels(pickArr(o, "certifications", "licenses", "licensesAndCertifications", "certificates"), ["name", "title"], (c) => pickStr(c, "authority", "issuedBy", "issuer", "subtitle", "companyName")),
    volunteering: labels(pickArr(o, "volunteering", "volunteerExperiences", "volunteer_experience", "volunteer", "volunteerExperience"), ["role", "title"], (v) => pickStr(v, "organizationName", "companyName", "organization", "company", "subtitle")),
    honors: labels(pickArr(o, "honors", "honorsAndAwards", "honors_and_awards", "awards"), ["title", "name"], (h) => pickStr(h, "issuedBy", "issuer", "subtitle")),
    activity: activityOf(o),
    actor,
  });
}

/** Extra quality info some actors expose (bovi: parse_confidence / warnings). */
export type LinkedInParseMeta = { parseConfidence: number | null; parsePath: string | null; warnings: string[] };

/** Extracts actor-reported parse quality (null/[] when the actor doesn't report it). */
export function linkedInParseMeta(raw: unknown): LinkedInParseMeta {
  const o = asObj(raw);
  const c = Number(pickVal(o, "parse_confidence", "parseConfidence"));
  return {
    parseConfidence: Number.isFinite(c) ? c : null,
    parsePath: pickStr(o, "parse_path", "parsePath") || null,
    warnings: asArr(o.warnings).map(str).filter(Boolean),
  };
}
