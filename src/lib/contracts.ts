/**
 * Shared contracts for the whole app. Every module (scraping, agents, pipeline,
 * storage, UI) talks through these types. Owned by the lead; do not edit from
 * feature modules — propose changes instead.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export const Platform = z.enum(["linkedin", "instagram"]);
export type Platform = z.infer<typeof Platform>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Gender = z.enum(["woman", "man", "nonbinary", "unspecified"]);
export type Gender = z.infer<typeof Gender>;

export const Seeking = z.enum(["women", "men", "everyone"]);
export type Seeking = z.infer<typeof Seeking>;

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

/** One person as pasted by a user: two official links. */
export const PersonInput = z.object({
  linkedin: z.string().min(1),
  instagram: z.string().min(1),
  name: z.string().optional(),
  gender: Gender.optional(),
  seeking: Seeking.optional(),
});
export type PersonInput = z.infer<typeof PersonInput>;

/** Canonical form of the two links after validation. */
export const CanonicalLinks = z.object({
  linkedinUrl: z.string(), // https://www.linkedin.com/in/<slug>
  linkedinSlug: z.string(),
  instagramHandle: z.string(), // lowercase handle without @
  instagramUrl: z.string(), // https://www.instagram.com/<handle>/
});
export type CanonicalLinks = z.infer<typeof CanonicalLinks>;

export const LinkErrorCode = z.enum([
  "linkedin_empty",
  "linkedin_not_url",
  "linkedin_shortlink",
  "linkedin_not_person",
  "linkedin_legacy_url",
  "instagram_empty",
  "instagram_not_profile",
  "instagram_invalid_handle",
  "duplicate",
  "bulk_limit",
]);
export type LinkErrorCode = z.infer<typeof LinkErrorCode>;

/* ------------------------------------------------------------------ */
/* Normalized scrape output (only public profile data, PII stripped)   */
/* ------------------------------------------------------------------ */

export const LinkedInExperience = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  dateRange: z.string().default(""),
  location: z.string().default(""),
  description: z.string().default(""),
});

export const LinkedInEducation = z.object({
  school: z.string().default(""),
  degree: z.string().default(""),
  dateRange: z.string().default(""),
});

export const NormalizedLinkedIn = z.object({
  url: z.string(),
  fullName: z.string().default(""),
  headline: z.string().default(""),
  about: z.string().default(""),
  location: z.string().default(""),
  photoUrl: z.string().nullable().default(null),
  followers: z.number().nullable().default(null),
  experience: z.array(LinkedInExperience).default([]),
  education: z.array(LinkedInEducation).default([]),
  skills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  volunteering: z.array(z.string()).default([]),
  honors: z.array(z.string()).default([]),
  /** Recent public posts/activity text if the actor returns it. */
  activity: z.array(z.string()).default([]),
  /** Which Apify actor produced this. */
  actor: z.string().default(""),
});
export type NormalizedLinkedIn = z.infer<typeof NormalizedLinkedIn>;

export const InstagramPost = z.object({
  id: z.string(),
  url: z.string().default(""),
  type: z.string().default("Image"), // Image | Video | Sidecar
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  mentions: z.array(z.string()).default([]),
  location: z.string().nullable().default(null),
  timestamp: z.string().nullable().default(null),
  likes: z.number().nullable().default(null),
  comments: z.number().nullable().default(null),
  imageUrl: z.string().nullable().default(null),
  /** Short alt text Instagram sometimes provides (accessibility caption). */
  alt: z.string().nullable().default(null),
});
export type InstagramPost = z.infer<typeof InstagramPost>;

export const NormalizedInstagram = z.object({
  handle: z.string(),
  url: z.string(),
  fullName: z.string().default(""),
  biography: z.string().default(""),
  externalUrls: z.array(z.string()).default([]),
  followers: z.number().nullable().default(null),
  following: z.number().nullable().default(null),
  postsCount: z.number().nullable().default(null),
  isPrivate: z.boolean().default(false),
  isVerified: z.boolean().default(false),
  isBusiness: z.boolean().default(false),
  category: z.string().nullable().default(null),
  profilePicUrl: z.string().nullable().default(null),
  posts: z.array(InstagramPost).default([]),
  actor: z.string().default(""),
});
export type NormalizedInstagram = z.infer<typeof NormalizedInstagram>;

/** Images captured at scrape time (Instagram CDN URLs expire). */
export const CapturedImage = z.object({
  postId: z.string(), // "profile" for the avatar
  dataUrl: z.string(), // data:image/jpeg;base64,...
});
export type CapturedImage = z.infer<typeof CapturedImage>;

export const ScrapeBundle = z.object({
  linkedin: NormalizedLinkedIn,
  instagram: NormalizedInstagram,
  images: z.array(CapturedImage).default([]),
  /** Avatar to display (small data URL), or null. */
  photoDataUrl: z.string().nullable().default(null),
});
export type ScrapeBundle = z.infer<typeof ScrapeBundle>;

/* ------------------------------------------------------------------ */
/* Agent output: reading + profile analysis                            */
/* ------------------------------------------------------------------ */

export const Evidence = z.object({
  source: Platform,
  /** Human pointer, e.g. "bio", "post 3", "experience: CTO @ Acme", "about". */
  ref: z.string(),
  /** Short verbatim-ish quote or paraphrase from the source. */
  quote: z.string().default(""),
  /** Deep link if known (post URL, profile URL). */
  url: z.string().nullable().default(null),
});
export type Evidence = z.infer<typeof Evidence>;

export const ReadingStep = z.object({
  source: z.enum(["linkedin", "instagram", "both"]),
  /** What the agent looked at, e.g. "Read the About section". */
  looked_at: z.string(),
  /** What it noticed, first person: "I notice ..." */
  observation: z.string(),
  evidence: z.array(Evidence).default([]),
});
export type ReadingStep = z.infer<typeof ReadingStep>;

export const ReadingLog = z.object({
  steps: z.array(ReadingStep).min(1),
  /** One-paragraph first impression after reading everything. */
  firstImpression: z.string(),
});
export type ReadingLog = z.infer<typeof ReadingLog>;

export const Trait = z.object({
  label: z.string(), // short chip text, e.g. "Trail running"
  detail: z.string(), // one sentence
  evidence: z.array(Evidence).min(1),
  confidence: Confidence,
});
export type Trait = z.infer<typeof Trait>;

export const QualityCategory = z.enum([
  "values",
  "personality",
  "lifestyle",
  "communication",
  "ambition",
  "humour",
  "aesthetic",
  "other",
]);

export const Quality = Trait.extend({ category: QualityCategory });
export type Quality = z.infer<typeof Quality>;

export const IdentityCheck = z.object({
  samePerson: z.enum(["likely", "unsure", "unlikely"]),
  reasons: z.array(z.string()).default([]),
});
export type IdentityCheck = z.infer<typeof IdentityCheck>;

export const ProfileAnalysis = z.object({
  displayName: z.string(),
  /** One-line hook, like a dating-profile headline. */
  tagline: z.string(),
  summary: z.string(),
  location: z.string().default(""),
  /** What this person needs in a partner (inferred, evidence-backed). */
  needs: z.array(Trait).min(1),
  hobbies: z.array(Trait).min(1),
  interests: z.array(Trait).min(1),
  otherQualities: z.array(Quality).min(1),
  greenFlags: z.array(z.string()).default([]),
  possibleDealbreakers: z.array(z.string()).default([]),
  conversationHooks: z.array(z.string()).default([]),
  idealFirstDate: z.string().default(""),
  identity: IdentityCheck,
  confidence: Confidence,
});
export type ProfileAnalysis = z.infer<typeof ProfileAnalysis>;

export const ProfileRecord = z.object({
  personId: z.string(),
  readingLog: ReadingLog,
  analysis: ProfileAnalysis,
  models: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ProfileRecord = z.infer<typeof ProfileRecord>;

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export const PersonStatus = z.enum([
  "queued", // links accepted, waiting to scrape
  "scraping", // Apify runs in flight
  "scraped", // raw data stored, waiting for the reader agent
  "analyzing", // reader agent working
  "profiled", // profile page ready, waiting for dates
  "dating", // agent is out on dates
  "ranked", // ranking computed
  "rejected_private", // Instagram is private -> not allowed
  "rejected_invalid", // profile not found / not public
  "identity_mismatch", // LinkedIn and Instagram look like different people
  "failed", // retryable failure
  "waiting_quota", // free-tier quota exhausted, will resume
]);
export type PersonStatus = z.infer<typeof PersonStatus>;

export const TERMINAL_REJECTED: PersonStatus[] = [
  "rejected_private",
  "rejected_invalid",
  "identity_mismatch",
];

export const Person = z.object({
  id: z.string(),
  pool: z.string(), // "demo" | "live"
  slug: z.string(),
  displayName: z.string(),
  linkedinUrl: z.string(),
  instagramHandle: z.string(),
  instagramUrl: z.string(),
  photoDataUrl: z.string().nullable().default(null),
  gender: Gender.default("unspecified"),
  seeking: Seeking.default("everyone"),
  status: PersonStatus,
  statusDetail: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
  attempts: z.number().default(0),
  hidden: z.boolean().default(false),
  /** Apify run bookkeeping while status === "scraping". */
  scrape: z
    .object({
      linkedinRunId: z.string().nullable().default(null),
      linkedinActor: z.string().nullable().default(null),
      instagramRunId: z.string().nullable().default(null),
      startedAt: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Person = z.infer<typeof Person>;

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export const DatePlan = z.object({
  venue: z.string(), // "Brooklyn Boulders"
  activity: z.string(), // "Bouldering, then tacos at the corner spot"
  why: z.string(), // why the agents picked it, citing both profiles
  vibe: z.string().default(""), // "playful, sporty"
});
export type DatePlan = z.infer<typeof DatePlan>;

export const ACTS = [
  { act: 1, title: "Arriving & icebreakers" },
  { act: 2, title: "Values, goals & dealbreakers" },
  { act: 3, title: "A week together & the goodbye" },
] as const;

export const Turn = z.object({
  idx: z.number(),
  act: z.number().int().min(1).max(3),
  speaker: z.enum(["a", "b"]),
  /** What the agent says out loud on the date, on behalf of its person. */
  text: z.string(),
  /** Private note the agent keeps for its person (shown in replay). */
  thought: z.string().default(""),
  /** Agent's private read of the vibe right now, 0-10. */
  vibe: z.number().min(0).max(10),
});
export type Turn = z.infer<typeof Turn>;

export const Debrief = z.object({
  chemistry: z.number().min(0).max(10),
  verdict: z.string(), // one line for the person
  clicked: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  secondDate: z.boolean(),
  reason: z.string(),
});
export type Debrief = z.infer<typeof Debrief>;

export const DateStatus = z.enum(["planned", "in_progress", "debriefing", "done", "failed"]);
export type DateStatus = z.infer<typeof DateStatus>;

export const DateMode = z.enum(["full", "compact"]);
export type DateMode = z.infer<typeof DateMode>;

export const DateRecord = z.object({
  id: z.string(),
  pool: z.string(),
  aId: z.string(), // the agent who asked
  bId: z.string(),
  status: DateStatus,
  mode: DateMode,
  /** Why the matchmaker paired them (pre-score explanation). */
  matchReason: z.string().default(""),
  prescore: z.number().min(0).max(1).default(0),
  plan: DatePlan.nullable().default(null),
  transcript: z.array(Turn).default([]),
  debriefA: Debrief.nullable().default(null),
  debriefB: Debrief.nullable().default(null),
  models: z.array(z.string()).default([]),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DateRecord = z.infer<typeof DateRecord>;

/** Turns per date in full mode (alternating a/b, spread over 3 acts). */
export const FULL_DATE_TURNS = 8;

/* ------------------------------------------------------------------ */
/* Rankings                                                            */
/* ------------------------------------------------------------------ */

export const RankingEntry = z.object({
  personId: z.string(), // the candidate being ranked
  rank: z.number().int().min(1),
  score: z.number().min(0).max(100),
  label: z.enum(["dated", "projected"]),
  rationale: z.string(),
  mutual: z.boolean().default(false),
  myChemistry: z.number().nullable().default(null), // my agent's debrief of them
  theirChemistry: z.number().nullable().default(null), // their agent's debrief of me
  prescore: z.number().min(0).max(1),
  dateId: z.string().nullable().default(null),
});
export type RankingEntry = z.infer<typeof RankingEntry>;

export const RankingRecord = z.object({
  personId: z.string(),
  entries: z.array(RankingEntry),
  computedAt: z.string(),
});
export type RankingRecord = z.infer<typeof RankingRecord>;

/* ------------------------------------------------------------------ */
/* LLM                                                                 */
/* ------------------------------------------------------------------ */

/** Task classes route to different models (see llm/router). */
export const LLMTask = z.enum(["read", "synthesize", "plan", "turn", "debrief", "compact_date"]);
export type LLMTask = z.infer<typeof LLMTask>;

/* ------------------------------------------------------------------ */
/* Status API                                                          */
/* ------------------------------------------------------------------ */

export const PoolStatus = z.object({
  pool: z.string(),
  frozen: z.boolean(),
  counts: z.record(z.string(), z.number()),
  people: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      displayName: z.string(),
      status: PersonStatus,
      statusDetail: z.string().nullable(),
      error: z.string().nullable(),
      photoDataUrl: z.string().nullable(),
    }),
  ),
  dates: z.object({ total: z.number(), done: z.number(), inProgress: z.number() }),
  pendingWork: z.boolean(),
  notice: z.string().nullable(),
});
export type PoolStatus = z.infer<typeof PoolStatus>;
