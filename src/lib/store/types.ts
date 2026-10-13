import type {
  DateRecord,
  Person,
  ProfileRecord,
  RankingRecord,
  ScrapeBundle,
} from "@/lib/contracts";

/**
 * Persistence boundary. Three implementations:
 * - FileStore: JSON file in .data/ (local dev, tests, demo seeding)
 * - SupabaseStore: Postgres via supabase-js (production live pool)
 * - SnapshotStore: read-only frozen demo pool bundled with the app
 */
export interface Store {
  readonly kind: "file" | "supabase" | "snapshot";
  readonly readOnly: boolean;

  listPeople(pool: string, opts?: { includeHidden?: boolean }): Promise<Person[]>;
  getPerson(id: string): Promise<Person | null>;
  getPersonBySlug(pool: string, slug: string): Promise<Person | null>;
  insertPeople(people: Person[]): Promise<void>;
  updatePerson(id: string, patch: Partial<Person>): Promise<Person>;

  saveSources(personId: string, pool: string, bundle: ScrapeBundle): Promise<void>;
  getSources(personId: string): Promise<ScrapeBundle | null>;
  deleteSources(personId: string): Promise<void>;

  saveProfile(pool: string, rec: ProfileRecord): Promise<void>;
  getProfile(personId: string): Promise<ProfileRecord | null>;
  listProfiles(pool: string): Promise<ProfileRecord[]>;
  deleteProfile(personId: string): Promise<void>;

  insertDates(dates: DateRecord[]): Promise<void>;
  updateDate(id: string, patch: Partial<DateRecord>): Promise<DateRecord>;
  getDate(id: string): Promise<DateRecord | null>;
  listDates(pool: string): Promise<DateRecord[]>;

  saveRanking(pool: string, rec: RankingRecord): Promise<void>;
  getRanking(personId: string): Promise<RankingRecord | null>;
  listRankings(pool: string): Promise<RankingRecord[]>;

  incrUsage(key: string, n?: number): Promise<number>;
  getUsage(key: string): Promise<number>;
  /** Keys (with counts) starting with a prefix, e.g. "removed:demo:". */
  listUsage(prefix: string): Promise<Array<{ key: string; count: number }>>;

  /** Best-effort mutual exclusion for pipeline ticks. */
  tryLock(name: string, ttlMs: number): Promise<boolean>;
  unlock(name: string): Promise<void>;
}

export class ReadOnlyStoreError extends Error {
  constructor() {
    super("This pool is frozen (read-only).");
  }
}

/** Shape of the frozen demo snapshot file. */
export interface Snapshot {
  pool: string;
  exportedAt: string | null;
  people: Person[];
  sources: Record<string, ScrapeBundle>;
  profiles: ProfileRecord[];
  dates: DateRecord[];
  rankings: RankingRecord[];
}
