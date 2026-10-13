/**
 * Scraping module public API (Agent A).
 *
 * - Link handling: {@link canonicalizeLinkedIn}, {@link canonicalizeInstagram}, {@link parsePeopleInput}
 * - Apify runs: {@link startScrape}, {@link pollScrape}, {@link scrapeNow} (+ single-platform helpers)
 * - Normalisation: {@link normalizeLinkedIn}, {@link normalizeInstagram}, PII scrubbing
 * - Images: {@link captureImages}
 * - Errors: {@link ApifyQuotaError}, {@link ScrapeConfigError}
 *
 * Server-only (uses apify-client and sharp).
 */
export { canonicalizeLinkedIn, canonicalizeInstagram, type LinkedInResult, type InstagramResult, type LinkError } from "./urls";
export { parsePeopleInput, DEFAULT_BULK_MAX, type AcceptedPerson, type PeopleInputError, type ParsedPeople, type ParsePeopleOptions } from "./bulk";
export {
  startScrape,
  pollScrape,
  scrapeNow,
  startLinkedInRun,
  startInstagramRun,
  pollLinkedInRun,
  type ScrapeRunRef,
  type ScrapeStarted,
  type PersonScrapeResult,
  type PollScrapeResult,
  type StartScrapeOptions,
  type ScrapeNowOptions,
} from "./scrape";
export {
  ApifyQuotaError,
  ScrapeConfigError,
  setApifyClientFactory,
  isQuotaError,
  type ApifyLike,
  type RunInfo,
  type RunStatus,
  type StartOptions,
} from "./apify";
export {
  normalizeLinkedIn,
  normalizeInstagram,
  linkedInParseMeta,
  scrubText,
  containsPII,
  extractHashtags,
  extractMentions,
  LI_LIMITS,
  IG_LIMITS,
  type LinkedInParseMeta,
} from "./normalize";
export { linkedInActorInput, linkedInInputStyle, HARVESTAPI_NO_EMAIL_MODE } from "./linkedin";
export { htmlToText } from "./util";
export { instagramActorInput } from "./instagram";
export { captureImages, svgAvatarDataUrl, type CaptureOptions } from "./images";
export { identitySignals, type IdentitySignals } from "./identity";
export { scrapeConfig, isMockMode, DEFAULT_ACTORS, type ScrapeConfig } from "./config";
export { mockLinkedIn, mockInstagram } from "./mock";
