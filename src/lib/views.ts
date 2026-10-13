/**
 * Read models for the UI. Pages call these functions (server-side only);
 * client components talk to the JSON API under /api.
 */
import type {
  DateMode,
  DatePlan,
  DateRecord,
  DateStatus,
  Debrief,
  Person,
  PersonStatus,
  ProfileAnalysis,
  ProfileRecord,
  RankingEntry,
  ReadingLog,
  ScrapeBundle,
} from "@/lib/contracts";
import { removedIds } from "@/lib/pipeline/removed";
import { DEMO_POOL, getStore, isFrozen, type Store } from "@/lib/store";

export interface PersonCard {
  id: string;
  slug: string;
  displayName: string;
  photoDataUrl: string | null;
  status: PersonStatus;
  statusDetail: string | null;
  error: string | null;
  tagline: string | null;
  location: string | null;
  topHobbies: string[];
  linkedinUrl: string;
  instagramUrl: string;
  instagramHandle: string;
}

export interface PoolView {
  pool: string;
  frozen: boolean;
  people: PersonCard[];
  stats: { people: number; profiled: number; dates: number; datesDone: number; mutual: number };
  /** Highest-scoring mutual pairs across the pool (for the "power couples" strip). */
  topMatches: Array<{ a: PersonCard; b: PersonCard; score: number; dateId: string | null }>;
}

export interface SourceSummary {
  linkedin: {
    url: string;
    fullName: string;
    headline: string;
    about: string;
    location: string;
    experience: Array<{ title: string; company: string; dateRange: string }>;
    education: Array<{ school: string; degree: string }>;
    skills: string[];
  };
  instagram: {
    url: string;
    handle: string;
    fullName: string;
    biography: string;
    followers: number | null;
    postsCount: number | null;
    isVerified: boolean;
    posts: Array<{
      id: string;
      url: string;
      caption: string;
      location: string | null;
      timestamp: string | null;
      likes: number | null;
      imageDataUrl: string | null;
    }>;
  };
}

export interface DateSummary {
  id: string;
  partner: PersonCard;
  status: DateStatus;
  mode: DateMode;
  plan: DatePlan | null;
  /** This person's agent's debrief of the partner. */
  myDebrief: Debrief | null;
  /** The partner's agent's debrief of this person. */
  theirDebrief: Debrief | null;
  mutual: boolean;
}

export type RankedCandidate = RankingEntry & { candidate: PersonCard };

export interface PersonView {
  pool: string;
  frozen: boolean;
  person: Person;
  card: PersonCard;
  profile: ProfileRecord | null;
  sources: SourceSummary | null;
  dates: DateSummary[];
  ranking: RankedCandidate[];
  rankingComputedAt: string | null;
}

export interface DateSide {
  card: PersonCard;
  analysis: Pick<
    ProfileAnalysis,
    "tagline" | "needs" | "hobbies" | "interests" | "possibleDealbreakers"
  > | null;
}

export interface DateView {
  pool: string;
  frozen: boolean;
  date: DateRecord;
  a: DateSide;
  b: DateSide;
}

export interface RankingsView {
  pool: string;
  frozen: boolean;
  people: PersonCard[];
  rankings: Record<string, RankedCandidate[]>;
  /** matrix[i][j] = score person i gives person j (0-100), null on the diagonal / unknown. */
  matrix: Array<Array<number | null>>;
}

function toCard(p: Person, profile?: ProfileRecord | null): PersonCard {
  const a = profile?.analysis;
  return {
    id: p.id,
    slug: p.slug,
    displayName: a?.displayName || p.displayName,
    photoDataUrl: p.photoDataUrl,
    status: p.status,
    statusDetail: p.statusDetail,
    error: p.error,
    tagline: a?.tagline ?? null,
    location: a?.location || null,
    topHobbies: (a?.hobbies ?? []).slice(0, 3).map((h) => h.label),
    linkedinUrl: p.linkedinUrl,
    instagramUrl: p.instagramUrl,
    instagramHandle: p.instagramHandle,
  };
}

function summarizeSources(b: ScrapeBundle): SourceSummary {
  const imgs = new Map(b.images.map((i) => [i.postId, i.dataUrl]));
  return {
    linkedin: {
      url: b.linkedin.url,
      fullName: b.linkedin.fullName,
      headline: b.linkedin.headline,
      about: b.linkedin.about,
      location: b.linkedin.location,
      experience: b.linkedin.experience
        .slice(0, 6)
        .map((e) => ({ title: e.title, company: e.company, dateRange: e.dateRange })),
      education: b.linkedin.education.slice(0, 4).map((e) => ({ school: e.school, degree: e.degree })),
      skills: b.linkedin.skills.slice(0, 15),
    },
    instagram: {
      url: b.instagram.url,
      handle: b.instagram.handle,
      fullName: b.instagram.fullName,
      biography: b.instagram.biography,
      followers: b.instagram.followers,
      postsCount: b.instagram.postsCount,
      isVerified: b.instagram.isVerified,
      posts: b.instagram.posts.slice(0, 12).map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption.slice(0, 280),
        location: p.location,
        timestamp: p.timestamp,
        likes: p.likes,
        imageDataUrl: imgs.get(p.id) ?? null,
      })),
    },
  };
}

async function loadPool(store: Store, pool: string) {
  const [allPeople, profiles, dates, rankings, removed] = await Promise.all([
    store.listPeople(pool),
    store.listProfiles(pool),
    store.listDates(pool),
    store.listRankings(pool),
    removedIds(pool),
  ]);
  const people = allPeople.filter((p) => !removed.has(p.id));
  const visible = new Set(people.map((p) => p.id));
  const profileById = new Map(profiles.map((p) => [p.personId, p]));
  const cards = new Map(people.map((p) => [p.id, toCard(p, profileById.get(p.id))]));
  const liveDates = dates.filter((d) => visible.has(d.aId) && visible.has(d.bId));
  return { people, profileById, cards, dates: liveDates, rankings };
}

function decorate(entries: RankingEntry[], cards: Map<string, PersonCard>): RankedCandidate[] {
  return entries
    .filter((e) => cards.has(e.personId))
    .map((e) => ({ ...e, candidate: cards.get(e.personId)! }));
}

const isMutual = (d: DateRecord) => Boolean(d.debriefA?.secondDate && d.debriefB?.secondDate);

export async function getPoolView(pool: string): Promise<PoolView> {
  const store = await getStore(pool);
  const { people, cards, dates, rankings } = await loadPool(store, pool);
  const done = dates.filter((d) => d.status === "done");
  const mutual = done.filter(isMutual);

  const scoreOf = (from: string, to: string) =>
    rankings.find((r) => r.personId === from)?.entries.find((e) => e.personId === to)?.score ?? 0;
  const topMatches = mutual
    .map((d) => ({
      a: cards.get(d.aId)!,
      b: cards.get(d.bId)!,
      score: Math.round((scoreOf(d.aId, d.bId) + scoreOf(d.bId, d.aId)) / 2),
      dateId: d.id,
    }))
    .filter((m) => m.a && m.b)
    .sort((x, y) => y.score - x.score)
    .slice(0, 6);

  return {
    pool,
    frozen: await isFrozen(pool),
    people: people.map((p) => cards.get(p.id)!),
    stats: {
      people: people.length,
      profiled: people.filter((p) => ["profiled", "dating", "ranked"].includes(p.status)).length,
      dates: dates.length,
      datesDone: done.length,
      mutual: mutual.length,
    },
    topMatches,
  };
}

export async function getPersonView(pool: string, slug: string): Promise<PersonView | null> {
  const store = await getStore(pool);
  const person = await store.getPersonBySlug(pool, slug);
  if (!person || person.hidden) return null;
  const { profileById, cards, dates } = await loadPool(store, pool);
  if (!cards.has(person.id)) return null; // removed from a frozen pool
  const [sources, ranking] = await Promise.all([
    store.getSources(person.id),
    store.getRanking(person.id),
  ]);
  const myDates: DateSummary[] = dates
    .filter((d) => d.aId === person.id || d.bId === person.id)
    .map((d) => {
      const iAmA = d.aId === person.id;
      const partner = cards.get(iAmA ? d.bId : d.aId)!;
      return {
        id: d.id,
        partner,
        status: d.status,
        mode: d.mode,
        plan: d.plan,
        myDebrief: iAmA ? d.debriefA : d.debriefB,
        theirDebrief: iAmA ? d.debriefB : d.debriefA,
        mutual: isMutual(d),
      };
    })
    .filter((d) => d.partner)
    .sort((x, y) => (y.myDebrief?.chemistry ?? -1) - (x.myDebrief?.chemistry ?? -1));

  return {
    pool,
    frozen: await isFrozen(pool),
    person,
    card: cards.get(person.id) ?? toCard(person, profileById.get(person.id)),
    profile: profileById.get(person.id) ?? null,
    sources: sources ? summarizeSources(sources) : null,
    dates: myDates,
    ranking: ranking ? decorate(ranking.entries, cards) : [],
    rankingComputedAt: ranking?.computedAt ?? null,
  };
}

export async function getDateView(pool: string, id: string): Promise<DateView | null> {
  const store = await getStore(pool);
  const date = await store.getDate(id);
  if (!date || date.pool !== pool) return null;
  const [pa, pb, fa, fb] = await Promise.all([
    store.getPerson(date.aId),
    store.getPerson(date.bId),
    store.getProfile(date.aId),
    store.getProfile(date.bId),
  ]);
  if (!pa || !pb || pa.hidden || pb.hidden) return null;
  const removed = await removedIds(pool);
  if (removed.has(pa.id) || removed.has(pb.id)) return null;
  const side = (p: Person, f: ProfileRecord | null): DateSide => ({
    card: toCard(p, f),
    analysis: f
      ? {
          tagline: f.analysis.tagline,
          needs: f.analysis.needs,
          hobbies: f.analysis.hobbies,
          interests: f.analysis.interests,
          possibleDealbreakers: f.analysis.possibleDealbreakers,
        }
      : null,
  });
  return { pool, frozen: await isFrozen(pool), date, a: side(pa, fa), b: side(pb, fb) };
}

export async function getRankingsView(pool: string): Promise<RankingsView> {
  const store = await getStore(pool);
  const { people, cards, rankings } = await loadPool(store, pool);
  const order = people.map((p) => p.id);
  const byPerson: Record<string, RankedCandidate[]> = {};
  for (const r of rankings) if (cards.has(r.personId)) byPerson[r.personId] = decorate(r.entries, cards);
  const matrix = order.map((from) =>
    order.map((to) => {
      if (from === to) return null;
      return byPerson[from]?.find((e) => e.personId === to)?.score ?? null;
    }),
  );
  return {
    pool,
    frozen: await isFrozen(pool),
    people: order.map((id) => cards.get(id)!),
    rankings: byPerson,
    matrix,
  };
}

/** Reading log helper for components that only need the log. */
export type { ReadingLog };
export { DEMO_POOL };
