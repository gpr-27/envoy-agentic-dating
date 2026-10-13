import Link from "next/link";
import { AddPeople } from "@/components/AddPeople";
import { Avatar } from "@/components/Avatar";
import { MutualSeal } from "@/components/Badges";
import { FlowDiagram } from "@/components/FlowDiagram";
import { possessive } from "@/lib/ui/format";
import { getDateView, getPoolView, type DateView, type PoolView } from "@/lib/views";

export const dynamic = "force-dynamic";

async function loadTeaser(): Promise<{ pool: PoolView | null; date: DateView | null }> {
  try {
    const pool = await getPoolView("demo");
    const top = pool.topMatches.find((m) => m.dateId);
    const date = top?.dateId ? await getDateView("demo", top.dateId) : null;
    return { pool, date };
  } catch {
    return { pool: null, date: null };
  }
}

function DateTeaser({ view }: { view: DateView }) {
  const { date, a, b } = view;
  const lines = date.transcript.slice(0, 3);
  return (
    <Link
      href={`/pool/demo/date/${date.id}`}
      className="group block rounded-[28px] border border-line bg-ink-2/80 p-5 shadow-[0_30px_80px_-40px_rgba(255,115,147,0.45)] transition hover:border-rose/60 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex -space-x-3">
          <Avatar name={a.card.displayName} src={a.card.photoDataUrl} size={44} ring="rose" eager />
          <Avatar name={b.card.displayName} src={b.card.photoDataUrl} size={44} ring="gold" eager />
        </div>
        {date.debriefA?.secondDate && date.debriefB?.secondDate && <MutualSeal size="sm" />}
      </div>
      {date.plan && (
        <p className="mt-4 text-sm text-mute">
          From the demo: {possessive(a.card.displayName)} and {possessive(b.card.displayName)} agents at{" "}
          <span className="text-cream">{date.plan.venue}</span>
        </p>
      )}
      <ol className="mt-4 space-y-2.5">
        {lines.map((t, i) => (
          <li
            key={t.idx}
            className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug motion-safe:animate-rise ${
              t.speaker === "a"
                ? "rounded-bl-md bg-rose/15 text-cream"
                : "ml-auto rounded-br-md bg-gold/15 text-cream"
            }`}
            style={{ animationDelay: `${300 + i * 450}ms` }}
          >
            <span className={`mb-0.5 block text-[11px] ${t.speaker === "a" ? "text-rose" : "text-gold"}`}>
              {possessive(t.speaker === "a" ? a.card.displayName : b.card.displayName)} agent
            </span>
            {t.text}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm font-medium text-rose group-hover:underline group-hover:underline-offset-4">
        Watch the whole date
      </p>
    </Link>
  );
}

export default async function Home() {
  const { pool, date } = await loadTeaser();
  const count = pool?.stats.people ?? 0;
  const demoLabel = count ? `See the finished demo (${count} people)` : "See the finished demo";

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h1 className="font-display text-[clamp(3rem,7.4vw,6.6rem)] leading-[0.94] tracking-[-0.02em] motion-safe:animate-rise">
            Your agent goes on the date.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-mute motion-safe:animate-rise [animation-delay:120ms]">
            Paste someone&apos;s LinkedIn and public Instagram. An agent reads both, writes their profile, then dates
            the other agents on their behalf and ranks who fits them best.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3 motion-safe:animate-rise [animation-delay:220ms]">
            <Link
              href="/pool/demo"
              className="rounded-full bg-rose px-6 py-3.5 font-semibold text-ink transition hover:bg-cream"
            >
              {demoLabel}
            </Link>
            <Link
              href="#add"
              className="rounded-full border border-line px-6 py-3.5 font-medium transition hover:border-cream"
            >
              Add your own people
            </Link>
          </div>
          {pool && pool.stats.people > 0 && (
            <p className="mt-6 text-sm text-faint">
              In the demo: {pool.stats.people} people, {pool.stats.datesDone} dates,{" "}
              {pool.stats.mutual} mutual matches.
            </p>
          )}
        </div>
        <div className="lg:pl-4">{date ? <DateTeaser view={date} /> : null}</div>
      </section>

      {/* Flow */}
      <section className="mx-auto max-w-6xl px-5 py-14" aria-labelledby="flow-h">
        <h2 id="flow-h" className="font-display text-4xl sm:text-5xl">
          From two links to a ranking
        </h2>
        <p className="mt-3 max-w-2xl text-mute">
          Each person is exactly two sources of information. Nothing else goes in.
        </p>
        <div className="mt-10">
          <FlowDiagram />
        </div>
      </section>

      {/* Add people */}
      <section id="add" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-14" aria-labelledby="add-h">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="add-h" className="font-display text-4xl sm:text-5xl">
              Add people
            </h2>
            <p className="mt-3 max-w-2xl text-mute">
              They join the live pool. Each agent takes a few minutes on free-tier models, and you can watch every
              step as it happens.
            </p>
          </div>
          <Link href="/pool/live" className="text-sm text-mute underline decoration-line underline-offset-4 hover:text-cream">
            Open the live pool
          </Link>
        </div>
        <AddPeople />
      </section>

      {/* How it works teaser */}
      <section className="mx-auto max-w-6xl px-5 py-14" aria-labelledby="how-h">
        <div className="grid gap-10 border-t border-line pt-14 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 id="how-h" className="font-display text-4xl">
              How it works
            </h2>
            <Link
              href="/how-it-works"
              className="mt-5 inline-block rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:border-cream"
            >
              Read the full explanation
            </Link>
          </div>
          <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div>
              <dt className="font-semibold">Two sources, nothing else</dt>
              <dd className="mt-2 text-sm leading-relaxed text-mute">
                The agent only sees the public LinkedIn and public Instagram. Private accounts are turned away.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Every trait has a receipt</dt>
              <dd className="mt-2 text-sm leading-relaxed text-mute">
                Needs, hobbies and interests each cite the post, bio line or role they came from.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Agents keep private notes</dt>
              <dd className="mt-2 text-sm leading-relaxed text-mute">
                Each agent knows only its own person, speaks turn by turn, and writes a private debrief after.
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
