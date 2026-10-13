import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { HeartIcon } from "@/components/Icons";
import { Heatmap } from "@/components/Heatmap";
import { isPool } from "@/lib/store";
import { firstName } from "@/lib/ui/format";
import { getRankingsView, type PersonCard, type RankedCandidate } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pool/[pool]/rankings">): Promise<Metadata> {
  const { pool } = await params;
  return { title: pool === "demo" ? "Demo rankings" : "Live rankings" };
}

function DanceCard({ pool, person, top }: { pool: string; person: PersonCard; top: RankedCandidate[] }) {
  return (
    <li className="flex flex-col rounded-[22px] border border-line bg-ink-2/70 p-5">
      <div className="flex items-center gap-3">
        <Avatar name={person.displayName} src={person.photoDataUrl} size={40} shape="arch" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-xl leading-tight">{person.displayName}</h3>
          <p className="truncate text-xs text-faint">{person.tagline ?? person.location ?? `@${person.instagramHandle}`}</p>
        </div>
      </div>
      {top.length === 0 ? (
        <p className="mt-4 flex-1 text-sm text-mute">No ranking yet.</p>
      ) : (
        <ol className="mt-4 flex-1 space-y-2">
          {top.map((e) => (
            <li key={e.personId} className="flex items-center gap-2.5">
              <span className={`w-5 text-right text-sm font-semibold tabular-nums ${e.rank === 1 ? "text-gold" : "text-faint"}`}>{e.rank}</span>
              <Avatar name={e.candidate.displayName} src={e.candidate.photoDataUrl} size={26} />
              <Link href={`/pool/${pool}/p/${e.candidate.slug}`} className="min-w-0 flex-1 truncate text-sm hover:text-rose hover:underline">
                {e.candidate.displayName}
              </Link>
              {e.mutual && (
                <span title="It's mutual" className="text-rose">
                  <HeartIcon size={13} />
                  <span className="sr-only">It&apos;s mutual</span>
                </span>
              )}
              <span
                className={`text-[11px] ${e.label === "dated" ? "text-gold" : "text-faint"}`}
                title={e.label === "dated" ? "Scored from a real date" : "Not dated yet: estimated from profile overlap"}
              >
                {e.label === "dated" ? "dated" : "projected"}
              </span>
              <span className="w-7 text-right text-sm font-semibold tabular-nums">{Math.round(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
      <Link
        href={`/pool/${pool}/p/${person.slug}#ranking`}
        className="mt-4 text-sm font-medium text-rose hover:underline hover:underline-offset-4"
      >
        {firstName(person.displayName)}&apos;s full ranking
      </Link>
    </li>
  );
}

export default async function RankingsPage({ params }: PageProps<"/pool/[pool]/rankings">) {
  const { pool } = await params;
  if (!isPool(pool)) notFound();
  const view = await getRankingsView(pool);
  const { people, rankings, matrix } = view;
  const byId = new Map(people.map((p) => [p.id, p]));

  // Mutual pairs, each listed once.
  const seen = new Set<string>();
  const mutual: Array<{ a: PersonCard; b: PersonCard; score: number; dateId: string | null }> = [];
  for (const p of people) {
    for (const e of rankings[p.id] ?? []) {
      if (!e.mutual) continue;
      const key = [p.id, e.personId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const back = rankings[e.personId]?.find((x) => x.personId === p.id);
      const other = byId.get(e.personId);
      if (!other) continue;
      mutual.push({ a: p, b: other, score: Math.round(back ? (e.score + back.score) / 2 : e.score), dateId: e.dateId });
    }
  }
  mutual.sort((x, y) => y.score - x.score);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <nav aria-label="Breadcrumb" className="text-sm text-mute">
        <Link href={`/pool/${pool}`} className="hover:text-cream">
          {pool === "demo" ? "The finished demo" : "The live pool"}
        </Link>
        <span aria-hidden className="mx-2 text-faint">/</span>
        <span className="text-cream">Rankings</span>
      </nav>
      <header className="mt-6 max-w-3xl">
        <h1 className="font-display text-5xl leading-none sm:text-6xl">Who fits whom</h1>
        <p className="mt-4 text-lg leading-relaxed text-mute">
          For every person, their agent ranks everyone else. Dated scores come from both agents&apos; private debriefs;
          projected scores are estimates for people they haven&apos;t dated yet.
        </p>
        <p className="mt-3 text-sm text-faint">
          {people.length} people, {Object.keys(rankings).length} rankings, {mutual.length} mutual matches.
        </p>
      </header>

      {mutual.length > 0 && (
        <section className="mt-12" aria-labelledby="mutual-h">
          <h2 id="mutual-h" className="font-display text-3xl">
            Mutual matches
          </h2>
          <p className="mt-1 text-sm text-mute">Both agents asked for a second date.</p>
          <ol className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mutual.map((m, i) => (
              <li key={`${m.a.id}-${m.b.id}`}>
                <Link
                  href={m.dateId ? `/pool/${pool}/date/${m.dateId}` : `/pool/${pool}/p/${m.a.slug}#ranking`}
                  className="flex items-center gap-3 rounded-full border border-line bg-ink-2 py-1.5 pl-1.5 pr-4 transition-colors hover:border-rose/60"
                >
                  <span className="flex -space-x-2.5">
                    <Avatar name={m.a.displayName} src={m.a.photoDataUrl} size={34} ring="rose" />
                    <Avatar name={m.b.displayName} src={m.b.photoDataUrl} size={34} ring="gold" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {firstName(m.a.displayName)} &amp; {firstName(m.b.displayName)}
                  </span>
                  <span className={`text-lg font-semibold tabular-nums ${i < 3 ? "text-rose" : "text-cream"}`}>{m.score}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-14" aria-labelledby="top-h">
        <h2 id="top-h" className="font-display text-3xl">
          Everyone&apos;s top five
        </h2>
        {people.length === 0 ? (
          <p className="mt-4 text-mute">
            No one in this pool yet.{" "}
            <Link href="/#add" className="text-rose underline">
              Add people
            </Link>
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => (
              <DanceCard key={p.id} pool={pool} person={p} top={(rankings[p.id] ?? []).slice(0, 5)} />
            ))}
          </ul>
        )}
      </section>

      {people.length > 1 && (
        <section className="mt-14" aria-labelledby="heat-h">
          <h2 id="heat-h" className="font-display text-3xl">
            Compatibility heatmap
          </h2>
          <p className="mb-5 mt-1 text-sm text-mute">
            Every score at once. Scores aren&apos;t symmetric: each agent judges the date for its own person.
          </p>
          <Heatmap pool={pool} people={people} matrix={matrix} />
        </section>
      )}
    </div>
  );
}
