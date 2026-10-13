import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DateRecord,
  Person,
  ProfileRecord,
  RankingRecord,
  ScrapeBundle,
} from "@/lib/contracts";
import type { Store } from "./types";

interface FileDb {
  people: Record<string, Person>;
  sources: Record<string, { pool: string; bundle: ScrapeBundle }>;
  profiles: Record<string, { pool: string; rec: ProfileRecord }>;
  dates: Record<string, DateRecord>;
  rankings: Record<string, { pool: string; rec: RankingRecord }>;
  usage: Record<string, number>;
}

const empty = (): FileDb => ({
  people: {},
  sources: {},
  profiles: {},
  dates: {},
  rankings: {},
  usage: {},
});

/**
 * Single-process JSON file store. All operations are serialized through an
 * in-process queue so concurrent pipeline steps never clobber each other.
 */
export class FileStore implements Store {
  readonly kind = "file" as const;
  readonly readOnly = false;
  private db: FileDb | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private locks = new Map<string, number>();
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly file: string = path.join(
      process.cwd(),
      process.env.FILE_STORE_PATH || path.join(".data", "db.json"),
    ),
  ) {}

  private async load(): Promise<FileDb> {
    if (this.db) return this.db;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.db = { ...empty(), ...(JSON.parse(raw) as Partial<FileDb>) };
    } catch {
      this.db = empty();
    }
    return this.db;
  }

  private writing: Promise<void> = Promise.resolve();

  /** Atomic write (temp file + rename). Writes are chained so two never overlap. */
  private persist(): Promise<void> {
    this.writing = this.writing.then(async () => {
      if (!this.db) return;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.db));
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }

  /** Debounced flush so bursts of updates cost one write. */
  private schedulePersist() {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.dirty = false;
        void this.persist();
      }
    }, 50);
  }

  /** Force pending writes to disk (scripts call this before exiting). */
  async flush(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.dirty = false;
    await this.persist();
  }

  private run<T>(fn: (db: FileDb) => T | Promise<T>, write = false): Promise<T> {
    const next = this.queue.then(async () => {
      const db = await this.load();
      const out = await fn(db);
      if (write) this.schedulePersist();
      return out;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  listPeople(pool: string, opts?: { includeHidden?: boolean }) {
    return this.run((db) =>
      Object.values(db.people)
        .filter((p) => p.pool === pool && (opts?.includeHidden || !p.hidden))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }
  getPerson(id: string) {
    return this.run((db) => db.people[id] ?? null);
  }
  getPersonBySlug(pool: string, slug: string) {
    return this.run(
      (db) => Object.values(db.people).find((p) => p.pool === pool && p.slug === slug) ?? null,
    );
  }
  insertPeople(people: Person[]) {
    return this.run((db) => {
      for (const p of people) db.people[p.id] = p;
    }, true);
  }
  updatePerson(id: string, patch: Partial<Person>) {
    return this.run((db) => {
      const cur = db.people[id];
      if (!cur) throw new Error(`person ${id} not found`);
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      db.people[id] = next;
      return next;
    }, true);
  }

  saveSources(personId: string, pool: string, bundle: ScrapeBundle) {
    return this.run((db) => {
      db.sources[personId] = { pool, bundle };
    }, true);
  }
  getSources(personId: string) {
    return this.run((db) => db.sources[personId]?.bundle ?? null);
  }
  deleteSources(personId: string) {
    return this.run((db) => {
      delete db.sources[personId];
    }, true);
  }

  saveProfile(pool: string, rec: ProfileRecord) {
    return this.run((db) => {
      db.profiles[rec.personId] = { pool, rec };
    }, true);
  }
  getProfile(personId: string) {
    return this.run((db) => db.profiles[personId]?.rec ?? null);
  }
  deleteProfile(personId: string) {
    return this.run((db) => {
      delete db.profiles[personId];
    }, true);
  }
  listProfiles(pool: string) {
    return this.run((db) =>
      Object.values(db.profiles)
        .filter((p) => p.pool === pool)
        .map((p) => p.rec),
    );
  }

  insertDates(dates: DateRecord[]) {
    return this.run((db) => {
      for (const d of dates) db.dates[d.id] = d;
    }, true);
  }
  updateDate(id: string, patch: Partial<DateRecord>) {
    return this.run((db) => {
      const cur = db.dates[id];
      if (!cur) throw new Error(`date ${id} not found`);
      const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
      db.dates[id] = next;
      return next;
    }, true);
  }
  getDate(id: string) {
    return this.run((db) => db.dates[id] ?? null);
  }
  listDates(pool: string) {
    return this.run((db) =>
      Object.values(db.dates)
        .filter((d) => d.pool === pool)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  saveRanking(pool: string, rec: RankingRecord) {
    return this.run((db) => {
      db.rankings[rec.personId] = { pool, rec };
    }, true);
  }
  getRanking(personId: string) {
    return this.run((db) => db.rankings[personId]?.rec ?? null);
  }
  listRankings(pool: string) {
    return this.run((db) =>
      Object.values(db.rankings)
        .filter((r) => r.pool === pool)
        .map((r) => r.rec),
    );
  }

  incrUsage(key: string, n = 1) {
    return this.run((db) => {
      db.usage[key] = (db.usage[key] ?? 0) + n;
      return db.usage[key];
    }, true);
  }
  getUsage(key: string) {
    return this.run((db) => db.usage[key] ?? 0);
  }
  listUsage(prefix: string) {
    return this.run((db) =>
      Object.entries(db.usage)
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, count]) => ({ key, count })),
    );
  }

  async tryLock(name: string, ttlMs: number) {
    const now = Date.now();
    const until = this.locks.get(name) ?? 0;
    if (until > now) return false;
    this.locks.set(name, now + ttlMs);
    return true;
  }
  async unlock(name: string) {
    this.locks.delete(name);
  }
}
