/**
 * Matchmaker (pure, deterministic, zero LLM calls): a symmetric pre-score
 * between two analyses, seeking-preference compatibility, and the pairing
 * where each agent asks out its top-k candidates.
 */
import type { Gender, ProfileAnalysis, Seeking } from "@/lib/contracts";
import { firstName } from "./format";
import { coverage, intersect, jaccard, tokenSet, tokens } from "./text";

/** Stable key for an unordered pair: "idA|idB" with ids sorted. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function offerSet(p: ProfileAnalysis): Set<string> {
  return tokenSet(
    p.tagline,
    p.summary,
    ...p.hobbies.flatMap((t) => [t.label, t.detail]),
    ...p.interests.flatMap((t) => [t.label, t.detail]),
    ...p.otherQualities.flatMap((t) => [t.label, t.detail]),
    ...p.greenFlags,
  );
}

function positiveSet(p: ProfileAnalysis): Set<string> {
  return tokenSet(...[...p.hobbies, ...p.interests, ...p.needs, ...p.otherQualities].flatMap((t) => [t.label, t.detail]));
}

const COMPLEMENTS: [string[], string[], string][] = [
  [["introvert", "quiet", "reserv", "listen"], ["extrovert", "outgo", "social", "talkativ"], "a quiet one and a social one"],
  [["plann", "organiz", "structur", "methodical"], ["spontaneou", "improvi", "impulsiv"], "a planner and a spontaneous one"],
  [["engineer", "technical", "analytical", "data"], ["creativ", "artist", "design", "artistic"], "an analytical mind and a creative one"],
];

function personalityTokens(p: ProfileAnalysis): string[] {
  return tokens(p.otherQualities.map((q) => `${q.label} ${q.detail}`).join(" "));
}

function hasAny(toks: string[], keys: string[]): boolean {
  return toks.some((t) => keys.some((k) => t.startsWith(k)));
}

function sharedLabels(a: ProfileAnalysis, b: ProfileAnalysis): string[] {
  const bTok = tokenSet(...[...b.hobbies, ...b.interests].map((t) => t.label));
  const out: string[] = [];
  for (const t of [...a.hobbies, ...a.interests]) {
    if (tokens(t.label).some((x) => bTok.has(x)) && !out.includes(t.label)) out.push(t.label);
  }
  return out.slice(0, 3);
}

function dealbreakerHits(a: ProfileAnalysis, b: ProfileAnalysis): string[] {
  const own = positiveSet(a);
  const offer = offerSet(b);
  const hits: string[] = [];
  for (const d of a.possibleDealbreakers) {
    const toks = tokens(d).filter((t) => !own.has(t) && t.length > 3);
    if (toks.some((t) => offer.has(t))) hits.push(d);
  }
  return hits;
}

/**
 * Symmetric pre-score in [0,1]: weighted (sqrt-)Jaccard over hobby/interest
 * labels and details, values/lifestyle/personality and needs; plus a
 * needs-vs-qualities fit bonus and complementarity bonus; minus a small
 * penalty for the other's dealbreaker keywords. Identical profiles score 1.
 */
export function prescore(a: ProfileAnalysis, b: ProfileAnalysis): { score: number; reasons: string[] } {
  const labels = (p: ProfileAnalysis) => tokenSet(...[...p.hobbies, ...p.interests].map((t) => t.label));
  const details = (p: ProfileAnalysis) => tokenSet(...[...p.hobbies, ...p.interests].map((t) => t.detail));
  const values = (p: ProfileAnalysis) =>
    tokenSet(...p.otherQualities.filter((q) => ["values", "lifestyle", "personality"].includes(q.category)).flatMap((q) => [q.label, q.detail]));
  const needs = (p: ProfileAnalysis) => tokenSet(...p.needs.flatMap((t) => [t.label, t.detail]));

  const parts: [number | null, number][] = [
    [jaccard(labels(a), labels(b)), 0.35],
    [jaccard(details(a), details(b)), 0.2],
    [jaccard(values(a), values(b)), 0.25],
    [jaccard(needs(a), needs(b)), 0.2],
  ];
  let num = 0;
  let den = 0;
  for (const [v, w] of parts) {
    if (v === null) continue;
    num += w * Math.sqrt(v);
    den += w;
  }
  const sim = den ? num / den : 0;

  const fitAB = coverage(needs(a), offerSet(b));
  const fitBA = coverage(needs(b), offerSet(a));
  const fits = [fitAB, fitBA].filter((x): x is number => x !== null);
  const fit = fits.length ? fits.reduce((s, x) => s + x, 0) / fits.length : 0;

  const pa = personalityTokens(a);
  const pb = personalityTokens(b);
  const oneWay = (p: string[], q: string[], x: string[], y: string[]) => hasAny(p, x) && hasAny(q, y) && !hasAny(p, y) && !hasAny(q, x);
  const comps = COMPLEMENTS.filter(([x, y]) => oneWay(pa, pb, x, y) || oneWay(pb, pa, x, y));
  const comp = Math.min(0.08, comps.length * 0.04);

  const dealAB = dealbreakerHits(a, b);
  const dealBA = dealbreakerHits(b, a);
  const penalty = Math.min(0.15, (dealAB.length + dealBA.length) * 0.05);

  const score = Math.round(Math.max(0, Math.min(1, sim + 0.2 * fit + comp - penalty)) * 1000) / 1000;

  const an = firstName(a.displayName);
  const bn = firstName(b.displayName);
  const reasons: string[] = [];
  const shared = sharedLabels(a, b);
  if (shared.length) reasons.push(`Both into ${shared.join(", ").toLowerCase()}`);
  const sharedValues = intersect(values(a), values(b)).slice(0, 3);
  if (sharedValues.length) reasons.push(`Similar values and lifestyle (${sharedValues.join(", ")})`);
  if (fitAB !== null && fitAB >= 0.25) reasons.push(`${bn} looks like what ${an} needs`);
  if (fitBA !== null && fitBA >= 0.25) reasons.push(`${an} looks like what ${bn} needs`);
  for (const c of comps) reasons.push(`Complementary: ${c[2]}`);
  for (const d of dealAB.slice(0, 1)) reasons.push(`Watch out for ${an}: "${d}"`);
  for (const d of dealBA.slice(0, 1)) reasons.push(`Watch out for ${bn}: "${d}"`);
  if (!reasons.length) reasons.push("Different worlds: a wildcard pairing");
  return { score, reasons };
}

/** Does `seeking` include `gender`? Unspecified on either side never blocks. */
function wants(seeking: Seeking | undefined, gender: Gender | undefined): boolean {
  if (!seeking || seeking === "everyone") return true;
  if (!gender || gender === "unspecified") return true;
  return seeking === "women" ? gender === "woman" : gender === "man";
}

/** Mutual seeking-preference compatibility (everyone/unspecified → compatible). */
export function compatible(a: { gender?: Gender; seeking?: Seeking }, b: { gender?: Gender; seeking?: Seeking }): boolean {
  return wants(a.seeking, b.gender) && wants(b.seeking, a.gender);
}

/** A date the matchmaker wants to happen. */
export interface DatePick {
  aId: string;
  bId: string;
  prescore: number;
  matchReason: string;
}

/** One pool member as the matchmaker sees them. */
export interface PoolMember {
  id: string;
  analysis: ProfileAnalysis;
  gender: Gender;
  seeking: Seeking;
}

/**
 * Each (focus) person's agent asks out its top-k compatible candidates by
 * pre-score (existing pairs count towards k and are not recreated). Pairs
 * are deduped; then everyone without any date gets their best compatible
 * partner. Deterministic: ties broken by id.
 */
export function pickDates(people: PoolMember[], opts: { k: number; existingPairs: Set<string>; focusIds?: string[] }): DatePick[] {
  const sorted = [...people].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const focus = new Set(opts.focusIds ?? sorted.map((p) => p.id));
  const cache = new Map<string, { score: number; reasons: string[] }>();
  const scoreOf = (x: PoolMember, y: PoolMember) => {
    const key = pairKey(x.id, y.id);
    let r = cache.get(key);
    if (!r) {
      r = x.id < y.id ? prescore(x.analysis, y.analysis) : prescore(y.analysis, x.analysis);
      cache.set(key, r);
    }
    return r;
  };
  const candidates = (p: PoolMember) =>
    sorted
      .filter((o) => o.id !== p.id && compatible(p, o))
      .map((o) => ({ o, s: scoreOf(p, o) }))
      .sort((x, y) => y.s.score - x.s.score || (x.o.id < y.o.id ? -1 : 1));

  const picks = new Map<string, DatePick>();
  const dated = new Set<string>();
  for (const key of opts.existingPairs) for (const id of key.split("|")) dated.add(id);

  const add = (asker: PoolMember, o: PoolMember, s: { score: number; reasons: string[] }) => {
    const key = pairKey(asker.id, o.id);
    if (opts.existingPairs.has(key) || picks.has(key)) return;
    if (!focus.has(asker.id) && !focus.has(o.id)) return;
    picks.set(key, {
      aId: asker.id,
      bId: o.id,
      prescore: s.score,
      matchReason: `${firstName(asker.analysis.displayName)}'s agent asked ${firstName(o.analysis.displayName)} out: ${s.reasons.slice(0, 2).join("; ")}.`,
    });
    dated.add(asker.id);
    dated.add(o.id);
  };

  for (const p of sorted) {
    if (!focus.has(p.id)) continue;
    for (const { o, s } of candidates(p).slice(0, Math.max(0, opts.k))) add(p, o, s);
  }
  // Lonely-node fix-up: everyone in focus gets at least one date if anyone compatible exists.
  for (const p of sorted) {
    if (!focus.has(p.id) || dated.has(p.id)) continue;
    const best = candidates(p)[0];
    if (best) add(p, best.o, best.s);
  }
  return [...picks.values()];
}
