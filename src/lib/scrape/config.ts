/**
 * Scraping configuration read from the environment (lazily, so tests can tweak env).
 */

/** Default actor ids (store slugs, `username/name`). */
export const DEFAULT_ACTORS = {
  linkedin: "harvestapi/linkedin-profile-scraper",
  linkedinFallback: "bovi/linkedin-profile-scraper",
  /** Supported but not used by default (returned 0 items in a real run, "no available accounts found"). */
  linkedinLegacy: "supreme_coder/linkedin-profile-scraper",
  instagram: "apify/instagram-profile-scraper",
} as const;

/** Resolved scrape configuration. */
export type ScrapeConfig = {
  token: string | undefined;
  linkedinActor: string;
  linkedinFallbackActor: string;
  instagramActor: string;
  mock: boolean;
};

/** Reads the current scrape configuration from `process.env`. */
export function scrapeConfig(): ScrapeConfig {
  const env = process.env;
  return {
    token: env.APIFY_TOKEN?.trim() || undefined,
    linkedinActor: env.APIFY_LINKEDIN_ACTOR?.trim() || DEFAULT_ACTORS.linkedin,
    linkedinFallbackActor: env.APIFY_LINKEDIN_FALLBACK_ACTOR?.trim() || DEFAULT_ACTORS.linkedinFallback,
    instagramActor: env.APIFY_INSTAGRAM_ACTOR?.trim() || DEFAULT_ACTORS.instagram,
    mock: isMockMode(),
  };
}

/** True when MOCK_EXTERNALS=1 (no network; synthetic data). */
export function isMockMode(): boolean {
  return process.env.MOCK_EXTERNALS === "1";
}
