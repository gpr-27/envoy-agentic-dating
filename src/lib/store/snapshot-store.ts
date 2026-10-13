import type { Person } from "@/lib/contracts";
import { ReadOnlyStoreError, type Snapshot, type Store } from "./types";

const ro = async (): Promise<never> => {
  throw new ReadOnlyStoreError();
};

/**
 * Read-only store over the frozen demo snapshot that ships with the app.
 * The demo therefore keeps working even if the database is paused.
 */
export class SnapshotStore implements Store {
  readonly kind = "snapshot" as const;
  readonly readOnly = true;

  constructor(private readonly snap: Snapshot) {}

  private visible(p: Person, includeHidden?: boolean) {
    return includeHidden || !p.hidden;
  }

  async listPeople(pool: string, opts?: { includeHidden?: boolean }) {
    return this.snap.people.filter((p) => p.pool === pool && this.visible(p, opts?.includeHidden));
  }
  async getPerson(id: string) {
    return this.snap.people.find((p) => p.id === id) ?? null;
  }
  async getPersonBySlug(pool: string, slug: string) {
    return this.snap.people.find((p) => p.pool === pool && p.slug === slug) ?? null;
  }
  insertPeople = ro;
  updatePerson = ro;

  saveSources = ro;
  async getSources(personId: string) {
    return this.snap.sources[personId] ?? null;
  }
  deleteSources = ro;

  saveProfile = ro;
  deleteProfile = ro;
  async getProfile(personId: string) {
    return this.snap.profiles.find((p) => p.personId === personId) ?? null;
  }
  async listProfiles() {
    return this.snap.profiles;
  }

  insertDates = ro;
  updateDate = ro;
  async getDate(id: string) {
    return this.snap.dates.find((d) => d.id === id) ?? null;
  }
  async listDates(pool: string) {
    return this.snap.dates.filter((d) => d.pool === pool);
  }

  saveRanking = ro;
  async getRanking(personId: string) {
    return this.snap.rankings.find((r) => r.personId === personId) ?? null;
  }
  async listRankings() {
    return this.snap.rankings;
  }

  async incrUsage() {
    return 0;
  }
  async getUsage() {
    return 0;
  }
  async listUsage() {
    return [];
  }
  async tryLock() {
    return false;
  }
  async unlock() {}
}
