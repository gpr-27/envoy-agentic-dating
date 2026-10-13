import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { PersonCard } from "@/components/PersonCard";
import { PipelineMonitor } from "@/components/PipelineMonitor";
import { PoolActions } from "@/components/PoolActions";
import { isPool } from "@/lib/store";
import { firstName, isReady } from "@/lib/ui/format";
import { getPoolView } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pool/[pool]">): Promise<Metadata> {
  const { pool } = await params;
  return { title: pool === "demo" ? "The finished demo" : "Live pool" };
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex min-w-24 flex-col-reverse">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="text-4xl font-semibold tracking-tight tabular-nums">{n}</dd>
    </div>
  );
}

export default async function PoolPage({ params }: PageProps<"/pool/[pool]">) {
  const { pool } = await params;
  if (!isPool(pool)) notFound();
  const view = await getPoolView(pool);
  const { stats, people, topMatches, frozen } = view;
  const isDemo = pool === "demo";
  const readyCount = people.filter((p) => isReady(p.status)).length;

  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <header className="flex flex-wrap items-end justify-between gap-8">
        <div className="max-w-2xl">
          <h1 className="font-display text-5xl leading-none sm:text-6xl">
            {isDemo ? "The finished demo" : "The live pool"}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-mute">
            {isDemo
              ? "Real public figures, already read, dated and ranked by their agents. Open anyone to see how their agent read them, the dates it went on, and who fits them best."
              : "Everyone added from the start page. Each person's agent reads their two links, then dates the other agents here."}
          </p>
        </div>
        {!frozen && <PoolActions pool={pool} canDate={readyCount >= 2} />}
      </header>

      <div className="mt-10 flex flex-wrap items-center gap-x-12 gap-y-6 border-y border-line py-6">
        <dl className="flex flex-wrap gap-x-12 gap-y-6">
        <Stat n={stats.people} label="people" />
        <Stat n={stats.profiled} label="profiles read" />
        <Stat n={stats.datesDone} label={`dates done${stats.dates > stats.datesDone ? ` of ${stats.dates}` : ""}`} />
        <Stat n={stats.mutual} label="mutual matches" />
        </dl>
        <div className="ml-auto">
          <Link
            href={`/pool/${pool}/rankings`}
            className="inline-flex rounded-full border border-gold/60 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold hover:text-ink"
          >
            See the rankings
          </Link>
        </div>
      </div>

      {!frozen && (
        <div className="mt-10">
          <PipelineMonitor pool={pool} frozen={frozen} />
        </div>
      )}

      {topMatches.length > 0 && (
        <section className="mt-14" aria-labelledby="couples-h">
          <h2 id="couples-h" className="font-display text-3xl">
            Power couples
          </h2>
          <p className="mt-1 text-sm text-mute">Both agents asked for a second date. Highest combined score first.</p>
          <ol className="scroll-quiet -mx-5 mt-5 flex snap-x gap-3 overflow-x-auto px-5 pb-3">
            {topMatches.map((m) => (
              <li key={`${m.a.id}-${m.b.id}`} className="snap-start">
                <Link
                  href={m.dateId ? `/pool/${pool}/date/${m.dateId}` : `/pool/${pool}/p/${m.a.slug}`}
                  className="flex w-64 items-center gap-3 rounded-full border border-line bg-ink-2 py-2 pl-2 pr-5 transition-colors hover:border-rose/60"
                >
                  <span className="flex -space-x-3">
                    <Avatar name={m.a.displayName} src={m.a.photoDataUrl} size={40} ring="rose" />
                    <Avatar name={m.b.displayName} src={m.b.photoDataUrl} size={40} ring="gold" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {firstName(m.a.displayName)} &amp; {firstName(m.b.displayName)}
                    </span>
                    <span className="text-xs text-mute">Watch their date</span>
                  </span>
                  <span className="text-xl font-semibold tabular-nums text-rose">{m.score}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-14" aria-labelledby="people-h">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="people-h" className="font-display text-3xl">
            Everyone
          </h2>
          <p className="text-sm text-mute">{people.length} people</p>
        </div>
        {people.length === 0 ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-line p-10 text-center">
            <p className="font-display text-2xl">Nobody here yet.</p>
            <p className="mt-2 text-mute">Paste a LinkedIn and a public Instagram to send in the first agent.</p>
            <Link
              href="/#add"
              className="mt-6 inline-flex rounded-full bg-rose px-5 py-2.5 font-semibold text-ink hover:bg-cream"
            >
              Add people
            </Link>
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((c) => (
              <PersonCard key={c.id} pool={pool} card={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
