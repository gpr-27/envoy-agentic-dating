/**
 * Normalisation entry point: raw actor items → contract types
 * ({@link NormalizedLinkedIn}, {@link NormalizedInstagram}).
 */
export { normalizeLinkedIn, linkedInParseMeta, linkedInItemUrl, LI_LIMITS, type LinkedInParseMeta } from "./normalize-linkedin";
export {
  normalizeInstagram,
  instagramItemHandle,
  instagramItemError,
  extractHashtags,
  extractMentions,
  IG_LIMITS,
} from "./normalize-instagram";
export { scrubText, isContactLink, containsPII } from "./pii";
