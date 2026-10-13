/**
 * Parses people submissions: a structured `people[]` array and/or free text
 * (one person per line, or a CSV with a header row).
 */
import { Gender, Seeking } from "@/lib/contracts";
import type { CanonicalLinks, LinkErrorCode, PersonInput } from "@/lib/contracts";
import { canonicalizeInstagram, canonicalizeLinkedIn, looksLikeInstagram, looksLikeLinkedIn } from "./urls";

/** A validated person ready to be enqueued. */
export type AcceptedPerson = CanonicalLinks & { name?: string; gender?: Gender; seeking?: Seeking };
/** A line-level (or submission-level, line 0) error. */
export type PeopleInputError = { line: number; input: string; code: LinkErrorCode; message: string };
/** Output of {@link parsePeopleInput}. */
export type ParsedPeople = { accepted: AcceptedPerson[]; errors: PeopleInputError[] };
/** Options for {@link parsePeopleInput}. */
export type ParsePeopleOptions = {
  /** Max people per submission (default 30). */
  max?: number;
  /** People already in the pool, for duplicate detection. */
  existing?: { linkedinUrl: string; instagramHandle: string }[];
};

/** Default per-submission limit. */
export const DEFAULT_BULK_MAX = 30;

type Row = {
  line: number;
  input: string;
  linkedin: string;
  instagram: string;
  name?: string;
  gender?: string;
  seeking?: string;
};

/** Minimal RFC-4180-ish CSV line splitter (handles quotes and escaped quotes). */
export function splitCsvLine(line: string, sep = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") {
      q = true;
      cur = "";
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

type HeaderMap = { linkedin: number; instagram: number; name: number; gender: number; seeking: number };

function detectHeader(line: string): { sep: string; map: HeaderMap } | null {
  if (looksLikeLinkedIn(line) || looksLikeInstagram(line)) return null;
  for (const sep of [",", ";", "\t", "|"]) {
    const cells = splitCsvLine(line, sep).map((c) => c.toLowerCase().replace(/[^a-z]/g, ""));
    if (cells.length < 2) continue;
    const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
    const map: HeaderMap = {
      linkedin: find(/^linkedin/),
      instagram: find(/^(instagram|ig|insta)/),
      name: find(/^(name|fullname|displayname)$/),
      gender: find(/^gender$/),
      seeking: find(/^(seeking|lookingfor|interestedin)$/),
    };
    if (map.linkedin >= 0 && map.instagram >= 0) return { sep, map };
  }
  return null;
}

/** Splits a free-form line into tokens and assigns LinkedIn / Instagram / name. */
function parseFreeLine(raw: string, line: number): Row {
  let tokens = raw
    .split(/\s*\|\s*|\s*;\s*|\t+|\s*,\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length < 2) tokens = raw.split(/\s+/).filter(Boolean);
  else if (tokens.length === 2 && tokens.some((t) => /\s/.test(t) && (looksLikeLinkedIn(t) || looksLikeInstagram(t)))) {
    // e.g. "url @handle, Jane Doe" → split the link part on whitespace too.
    tokens = tokens.flatMap((t) => (/\s/.test(t) && (looksLikeLinkedIn(t) || looksLikeInstagram(t)) ? t.split(/\s+/) : [t]));
  }
  let li = tokens.findIndex(looksLikeLinkedIn);
  let ig = tokens.findIndex((t, i) => i !== li && looksLikeInstagram(t));
  // Columns 1–2 are the two links in either order; anything after is the name.
  if (li < 0) li = [0, 1].find((i) => i !== ig && i < tokens.length && !/\s/.test(tokens[i] ?? "") && looksLikeUrlish(tokens[i] ?? "")) ?? -1;
  if (ig < 0) ig = [0, 1].find((i) => i !== li && i < tokens.length && !/\s/.test(tokens[i] ?? "")) ?? -1;
  const rest = tokens.filter((_, i) => i !== li && i !== ig);
  const name = rest.join(" ").trim();
  return {
    line,
    input: raw,
    linkedin: li >= 0 ? tokens[li] : "",
    instagram: ig >= 0 ? tokens[ig] : "",
    name: name || undefined,
  };
}

function looksLikeUrlish(t: string): boolean {
  return /[./]/.test(t) && !looksLikeInstagram(t);
}

function rowsFromText(text: string): Row[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: Row[] = [];
  let header: { sep: string; map: HeaderMap } | null = null;
  let sawContent = false;
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    if (!sawContent) {
      sawContent = true;
      header = detectHeader(line);
      if (header) return;
    }
    if (header) {
      const { sep, map } = header;
      const cells = splitCsvLine(line, sep);
      const at = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
      rows.push({
        line: idx + 1,
        input: line,
        linkedin: at(map.linkedin),
        instagram: at(map.instagram),
        name: at(map.name) || undefined,
        gender: at(map.gender) || undefined,
        seeking: at(map.seeking) || undefined,
      });
    } else rows.push(parseFreeLine(line, idx + 1));
  });
  return rows;
}

function parseGender(v?: string): Gender | undefined {
  const r = Gender.safeParse(v?.trim().toLowerCase());
  return r.success ? r.data : undefined;
}

function parseSeeking(v?: string): Seeking | undefined {
  const r = Seeking.safeParse(v?.trim().toLowerCase());
  return r.success ? r.data : undefined;
}

/**
 * Validates and canonicalises a people submission.
 * - More than `max` people → a single `bulk_limit` error and nothing accepted.
 * - Each bad row yields line-level errors; good rows are still accepted.
 * - Duplicates (same LinkedIn or same Instagram, within the input or vs `existing`) → `duplicate`.
 */
export function parsePeopleInput(
  input: { text?: string; people?: PersonInput[] },
  opts: ParsePeopleOptions = {},
): ParsedPeople {
  const max = opts.max ?? DEFAULT_BULK_MAX;
  const rows: Row[] = (input.people ?? []).map((p, i) => ({
    line: i + 1,
    input: `${p.linkedin ?? ""}, ${p.instagram ?? ""}`,
    linkedin: p.linkedin ?? "",
    instagram: p.instagram ?? "",
    name: p.name,
    gender: p.gender,
    seeking: p.seeking,
  }));
  if (input.text) {
    const offset = rows.length;
    rows.push(...rowsFromText(input.text).map((r) => ({ ...r, line: r.line + offset })));
  }

  if (rows.length > max) {
    return {
      accepted: [],
      errors: [
        {
          line: 0,
          input: "",
          code: "bulk_limit",
          message: `That's ${rows.length} people — the limit is ${max} per submission. Split the list and submit the rest separately.`,
        },
      ],
    };
  }

  const seenLi = new Set<string>();
  const seenIg = new Set<string>();
  for (const e of opts.existing ?? []) {
    const li = canonicalizeLinkedIn(e.linkedinUrl);
    seenLi.add(li.ok ? li.url : e.linkedinUrl.toLowerCase());
    const ig = canonicalizeInstagram(e.instagramHandle);
    seenIg.add(ig.ok ? ig.handle : e.instagramHandle.toLowerCase());
  }
  const existingLi = new Set(seenLi);
  const existingIg = new Set(seenIg);

  const accepted: AcceptedPerson[] = [];
  const errors: PeopleInputError[] = [];
  for (const row of rows) {
    const li = canonicalizeLinkedIn(row.linkedin);
    const ig = canonicalizeInstagram(row.instagram);
    if (!li.ok) errors.push({ line: row.line, input: row.input, code: li.code, message: li.message });
    if (!ig.ok) errors.push({ line: row.line, input: row.input, code: ig.code, message: ig.message });
    if (!li.ok || !ig.ok) continue;

    const dupLi = seenLi.has(li.url);
    const dupIg = seenIg.has(ig.handle);
    if (dupLi || dupIg) {
      const where = (dupLi ? existingLi.has(li.url) : existingIg.has(ig.handle)) ? "already in this pool" : "listed twice in this submission";
      const which = dupLi ? `linkedin.com/in/${li.slug}` : `@${ig.handle}`;
      errors.push({ line: row.line, input: row.input, code: "duplicate", message: `${which} is ${where} — each person only needs to be added once.` });
      continue;
    }
    seenLi.add(li.url);
    seenIg.add(ig.handle);
    const person: AcceptedPerson = {
      linkedinUrl: li.url,
      linkedinSlug: li.slug,
      instagramHandle: ig.handle,
      instagramUrl: ig.url,
    };
    const name = row.name?.trim();
    if (name) person.name = name.slice(0, 120);
    const gender = parseGender(row.gender);
    if (gender) person.gender = gender;
    const seeking = parseSeeking(row.seeking);
    if (seeking) person.seeking = seeking;
    accepted.push(person);
  }
  return { accepted, errors };
}
