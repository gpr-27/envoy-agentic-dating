/**
 * Pure formatting helpers shared by server and client components.
 * No server-only imports here.
 */
import type { PersonStatus } from "@/lib/contracts";

export type Tone = "work" | "ready" | "done" | "warn" | "error" | "idle";

export interface StatusInfo {
  label: string;
  description: string;
  tone: Tone;
}

export const STATUS_INFO: Record<PersonStatus, StatusInfo> = {
  queued: {
    label: "In line",
    description: "Links accepted. Waiting for a free slot to fetch the two pages.",
    tone: "idle",
  },
  scraping: {
    label: "Fetching pages",
    description: "Pulling the public LinkedIn and Instagram pages.",
    tone: "work",
  },
  scraped: {
    label: "Pages fetched",
    description: "Both pages are in. Waiting for the reader agent.",
    tone: "work",
  },
  analyzing: {
    label: "Agent is reading",
    description: "The agent is reading both profiles and writing the analysis.",
    tone: "work",
  },
  profiled: {
    label: "Profile ready",
    description: "Profile page is ready. Waiting to go on dates.",
    tone: "ready",
  },
  dating: {
    label: "Out on dates",
    description: "This person's agent is on dates with other agents.",
    tone: "work",
  },
  ranked: {
    label: "Ranked",
    description: "Dates are done and the ranking is in.",
    tone: "done",
  },
  rejected_private: {
    label: "Private Instagram",
    description: "Instagram is private — only public profiles are allowed.",
    tone: "error",
  },
  rejected_invalid: {
    label: "Profile not found",
    description: "One of the links isn't a public profile we can read. Check both links.",
    tone: "error",
  },
  identity_mismatch: {
    label: "Two different people?",
    description: "The LinkedIn and Instagram look like different people. Confirm if they're the same person.",
    tone: "warn",
  },
  failed: {
    label: "Failed",
    description: "Something went wrong while processing. Retry to pick up where it stopped.",
    tone: "error",
  },
  waiting_quota: {
    label: "Paused for quota",
    description: "Free-tier quota reached, resuming automatically.",
    tone: "warn",
  },
};

export function statusInfo(s: string): StatusInfo {
  return (STATUS_INFO as Record<string, StatusInfo>)[s] ?? { label: s, description: "", tone: "idle" };
}

export const READY_STATUSES: PersonStatus[] = ["profiled", "dating", "ranked"];
export const WORKING_STATUSES: PersonStatus[] = ["queued", "scraping", "scraped", "analyzing"];

export function isReady(s: string) {
  return (READY_STATUSES as string[]).includes(s);
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function possessive(name: string) {
  const n = firstName(name);
  return n.endsWith("s") ? `${n}'` : `${n}'s`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const a = parts[0][0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

export function compactNumber(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

export const QUALITY_LABEL: Record<string, string> = {
  values: "Values",
  personality: "Personality",
  lifestyle: "Lifestyle",
  communication: "Communication",
  ambition: "Ambition",
  humour: "Humour",
  aesthetic: "Aesthetic",
  other: "Other",
};

/**
 * Turn an evidence ref ("post 3", "bio", "about", "experience: CTO @ Acme",
 * "headline", "skills", "education") into the DOM id of the matching item in
 * the sources panel. Returns null when nothing sensible matches.
 */
export function evidenceTarget(
  source: string,
  ref: string,
  ctx?: { experience?: Array<{ title: string; company: string }>; posts?: number },
): string | null {
  const r = ref.toLowerCase().trim();
  const post = r.match(/post\s*#?\s*(\d+)/);
  if (post) {
    const n = Number(post[1]);
    if (ctx?.posts != null && (n < 1 || n > ctx.posts)) return "src-ig-posts";
    return `src-ig-post-${n}`;
  }
  if (/\bposts?\b|caption|hashtag|grid|photos?/.test(r)) return "src-ig-posts";
  if (/\bbio\b|biograph|external|link in bio|instagram name|followers|following/.test(r)) return "src-ig-bio";
  if (/headline|title line/.test(r)) return "src-li-headline";
  if (/about|summary/.test(r)) return "src-li-about";
  if (/experience|role|job|work|position|@/.test(r)) {
    const after = r.split(":").slice(1).join(":").trim();
    if (after && ctx?.experience?.length) {
      const idx = ctx.experience.findIndex((e) => {
        const t = `${e.title} ${e.company}`.toLowerCase();
        return after.split(/[\s@,]+/).filter((w) => w.length > 2).some((w) => t.includes(w));
      });
      if (idx >= 0) return `src-li-exp-${idx}`;
    }
    return "src-li-experience";
  }
  if (/education|school|university|degree|college/.test(r)) return "src-li-education";
  if (/skill/.test(r)) return "src-li-skills";
  if (/location|city/.test(r)) return source === "instagram" ? "src-ig-bio" : "src-li-headline";
  if (source === "instagram") return "src-ig-bio";
  if (source === "linkedin") return "src-li-about";
  return null;
}
