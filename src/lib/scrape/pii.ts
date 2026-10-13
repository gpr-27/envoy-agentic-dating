/**
 * PII scrubbing. We only keep public profile data and never store contact
 * details, even when an actor returns them or a bio contains them.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Obfuscated emails like "jane [at] mail [dot] com". */
const OBFUSCATED_EMAIL_RE = /\b[\w.+-]+\s*[([{]\s*at\s*[)\]}]\s*[\w-]+\s*[([{]\s*dot\s*[)\]}]\s*[a-z]{2,}\b/gi;
/** Candidate phone numbers: 9–15 digits with common separators, not inside URLs/ids. */
const PHONE_CANDIDATE_RE = /(?<![\w/=&?.%-])\+?\(?\d[\d\s().-]{7,}\d(?![\w%])/g;
/** Direct-message / contact links (WhatsApp, Telegram, Messenger, IG DM, mailto, tel, sms). */
const DM_LINK_RE =
  /\b(?:(?:https?:\/\/)?(?:www\.)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|m\.me|ig\.me|signal\.me)\/\S*|(?:mailto|tel|sms|whatsapp):\S+)/gi;
/** Leftover labels such as "Email:" / "Phone -" / "📞" right before a removed value. */
const CONTACT_LABEL_RE =
  /(?:\b(?:e-?mail|mail|phone|tel|call|text|whats\s?app|contact|dm|bookings?)\b|📧|📞|☎️?|📱|✉️?)\s*(?:me\s*)?(?:at|on|:|-|–|—)?\s*(?=\[removed\])/gi;

const REMOVED = "[removed]";

function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n++;
  return n;
}

/** Looks like a year range ("2015 - 2020", "2019–2023") rather than a phone. */
function isDateLike(s: string): boolean {
  return /^\(?(?:19|20)\d{2}\)?(?:\s*[-–.]\s*(?:19|20)\d{2})*$/.test(s.trim());
}

/**
 * Removes emails, phone numbers and DM/contact links from free text.
 * Collapses the whitespace it leaves behind. Safe on any string.
 */
export function scrubText(input: string): string {
  if (!input) return "";
  let s = input.replace(DM_LINK_RE, REMOVED);
  s = s.replace(EMAIL_RE, REMOVED).replace(OBFUSCATED_EMAIL_RE, REMOVED);
  s = s.replace(PHONE_CANDIDATE_RE, (m) => {
    const d = countDigits(m);
    if (d < 9 || d > 15 || isDateLike(m)) return m;
    return REMOVED;
  });
  s = s.replace(CONTACT_LABEL_RE, "");
  // Merge consecutive markers and tidy whitespace.
  s = s.replace(/(?:\[removed\][\s,;|/]*){2,}/g, `${REMOVED} `);
  return s.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

/** True when a URL is a contact/DM link we must not store (mailto:, tel:, wa.me, t.me, ...). */
export function isContactLink(url: string): boolean {
  const u = url.trim();
  const dm = new RegExp(DM_LINK_RE.source, "i");
  const email = new RegExp(`^${EMAIL_RE.source}$`, "i");
  return dm.test(u) || email.test(u) || /^(?:mailto|tel|sms|whatsapp):/i.test(u);
}

/** True when text still contains something that looks like an email or phone number. */
export function containsPII(text: string): boolean {
  return scrubText(text) !== text.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}
