import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  DateRecord,
  Person,
  ProfileRecord,
  RankingRecord,
  ScrapeBundle,
} from "@/lib/contracts";
import type { Store } from "./types";

/** Unwrap a supabase-js response or throw with context. */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`supabase ${what}: ${res.error.message}`);
  return res.data as T;
}

/**
 * Postgres-backed store. Server-only: uses the service-role key, which must
 * never reach the browser (this module is only imported from server code).
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  readonly readOnly = false;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listPeople(pool: string, opts?: { includeHidden?: boolean }) {
    let q = this.db.from("people").select("data").eq("pool", pool).order("created_at");
    if (!opts?.includeHidden) q = q.eq("hidden", false);
    const rows = must(await q, "listPeople") as { data: Person }[];
    return rows.map((r) => r.data);
  }
  async getPerson(id: string) {
    const rows = must(
      await this.db.from("people").select("data").eq("id", id).limit(1),
      "getPerson",
    ) as { data: Person }[];
    return rows[0]?.data ?? null;
  }
  async getPersonBySlug(pool: string, slug: string) {
    const rows = must(
      await this.db.from("people").select("data").eq("pool", pool).eq("slug", slug).limit(1),
      "getPersonBySlug",
    ) as { data: Person }[];
    return rows[0]?.data ?? null;
  }
  async insertPeople(people: Person[]) {
    if (!people.length) return;
    must(
      await this.db.from("people").insert(
        people.map((p) => ({
          id: p.id,
          pool: p.pool,
          slug: p.slug,
          hidden: p.hidden,
          created_at: p.createdAt,
          data: p,
        })),
      ),
      "insertPeople",
    );
  }
  async updatePerson(id: string, patch: Partial<Person>) {
    const cur = await this.getPerson(id);
    if (!cur) throw new Error(`person ${id} not found`);
    const next: Person = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    must(
      await this.db.from("people").update({ data: next, hidden: next.hidden }).eq("id", id),
      "updatePerson",
    );
    return next;
  }

  async saveSources(personId: string, pool: string, bundle: ScrapeBundle) {
    must(
      await this.db.from("sources").upsert({ person_id: personId, pool, data: bundle }),
      "saveSources",
    );
  }
  async getSources(personId: string) {
    const rows = must(
      await this.db.from("sources").select("data").eq("person_id", personId).limit(1),
      "getSources",
    ) as { data: ScrapeBundle }[];
    return rows[0]?.data ?? null;
  }
  async deleteSources(personId: string) {
    must(await this.db.from("sources").delete().eq("person_id", personId), "deleteSources");
  }

  async saveProfile(pool: string, rec: ProfileRecord) {
    must(
      await this.db.from("profiles").upsert({ person_id: rec.personId, pool, data: rec }),
      "saveProfile",
    );
  }
  async getProfile(personId: string) {
    const rows = must(
      await this.db.from("profiles").select("data").eq("person_id", personId).limit(1),
      "getProfile",
    ) as { data: ProfileRecord }[];
    return rows[0]?.data ?? null;
  }
  async deleteProfile(personId: string) {
    must(await this.db.from("profiles").delete().eq("person_id", personId), "deleteProfile");
  }
  async listProfiles(pool: string) {
    const rows = must(
      await this.db.from("profiles").select("data").eq("pool", pool),
      "listProfiles",
    ) as { data: ProfileRecord }[];
    return rows.map((r) => r.data);
  }

  async insertDates(dates: DateRecord[]) {
    if (!dates.length) return;
    // ignoreDuplicates: the (pool, pair) unique index makes concurrent rounds safe.
    must(
      await this.db.from("dates").upsert(
        dates.map((d) => ({
          id: d.id,
          pool: d.pool,
          a_id: d.aId,
          b_id: d.bId,
          created_at: d.createdAt,
          data: d,
        })),
        { ignoreDuplicates: true },
      ),
      "insertDates",
    );
  }
  async updateDate(id: string, patch: Partial<DateRecord>) {
    const cur = await this.getDate(id);
    if (!cur) throw new Error(`date ${id} not found`);
    const next: DateRecord = { ...cur, ...patch, updatedAt: new Date().toISOString() };
    must(await this.db.from("dates").update({ data: next }).eq("id", id), "updateDate");
    return next;
  }
  async getDate(id: string) {
    const rows = must(
      await this.db.from("dates").select("data").eq("id", id).limit(1),
      "getDate",
    ) as { data: DateRecord }[];
    return rows[0]?.data ?? null;
  }
  async listDates(pool: string) {
    const rows = must(
      await this.db.from("dates").select("data").eq("pool", pool).order("created_at"),
      "listDates",
    ) as { data: DateRecord }[];
    return rows.map((r) => r.data);
  }

  async saveRanking(pool: string, rec: RankingRecord) {
    must(
      await this.db.from("rankings").upsert({ person_id: rec.personId, pool, data: rec }),
      "saveRanking",
    );
  }
  async getRanking(personId: string) {
    const rows = must(
      await this.db.from("rankings").select("data").eq("person_id", personId).limit(1),
      "getRanking",
    ) as { data: RankingRecord }[];
    return rows[0]?.data ?? null;
  }
  async listRankings(pool: string) {
    const rows = must(
      await this.db.from("rankings").select("data").eq("pool", pool),
      "listRankings",
    ) as { data: RankingRecord }[];
    return rows.map((r) => r.data);
  }

  async incrUsage(key: string, n = 1) {
    return must(await this.db.rpc("incr_usage", { k: key, n }), "incrUsage") as number;
  }
  async getUsage(key: string) {
    const rows = must(
      await this.db.from("usage").select("count").eq("key", key).limit(1),
      "getUsage",
    ) as { count: number }[];
    return rows[0]?.count ?? 0;
  }

  async listUsage(prefix: string) {
    const escaped = prefix.replace(/[%_\\]/g, (c) => `\\${c}`);
    return must(
      await this.db.from("usage").select("key, count").like("key", `${escaped}%`).limit(1000),
      "listUsage",
    ) as Array<{ key: string; count: number }>;
  }

  async tryLock(name: string, ttlMs: number) {
    return Boolean(
      must(await this.db.rpc("try_lock", { lock_name: name, ttl_ms: ttlMs }), "tryLock"),
    );
  }
  async unlock(name: string) {
    must(await this.db.from("locks").delete().eq("name", name), "unlock");
  }

  /** Cheap round-trip used by the keepalive/health endpoint. */
  async ping(): Promise<void> {
    must(await this.db.from("usage").select("key").limit(1), "ping");
  }
}
