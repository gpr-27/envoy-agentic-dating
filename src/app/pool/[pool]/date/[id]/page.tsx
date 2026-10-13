import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTS } from "@/lib/contracts";
import { Avatar } from "@/components/Avatar";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Pill } from "@/components/Badges";
import { DateReplay } from "@/components/date/DateReplay";
import { PinIcon } from "@/components/Icons";
import { PipelineTicker } from "@/components/PipelineTicker";
import { isPool } from "@/lib/store";
import { firstName } from "@/lib/ui/format";
import { getDateView } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pool/[pool]/date/[id]">): Promise<Metadata> {
  const { pool, id } = await params;
  if (!isPool(pool)) return {};
  const v = await getDateView(pool, id).catch(() => null);
  return { title: v ? `${firstName(v.a.card.displayName)} & ${firstName(v.b.card.displayName)}, a date` : "Date" };
}

const MODE = {
  full: { label: "Full date", detail: "Each agent spoke independently, turn by turn." },
  compact: { label: "Compact simulation", detail: "Compact simulation (free-tier quota saver)." },
} as const;

export default async function DatePage({ params }: PageProps<"/pool/[pool]/date/[id]">) {
  const { pool, id } = await params;
  if (!isPool(pool)) notFound();
  const view = await getDateView(pool, id);
  if (!view) notFound();
  const { date, a, b, frozen } = view;
  const live = date.status === "planned" || date.status === "in_progress" || date.status === "debriefing";
  const mode = MODE[date.mode] ?? MODE.full;

  return (
    <article className="mx-auto max-w-6xl px-5 pb-10 pt-10">
      {live && (frozen ? <AutoRefresh ms={3000} /> : <PipelineTicker pool={pool} ms={3000} />)}
      <nav aria-label="Breadcrumb" className="text-sm text-mute">
        <Link href={`/pool/${pool}`} className="hover:text-cream">
          {pool === "demo" ? "The finished demo" : "The live pool"}
        </Link>
        <span aria-hidden className="mx-2 text-faint">/</span>
        <Link href={`/pool/${pool}/p/${a.card.slug}#dates`} className="hover:text-cream">
          {a.card.displayName}
        </Link>
        <span aria-hidden className="mx-2 text-faint">/</span>
        <span className="text-cream">Date with {firstName(b.card.displayName)}</span>
      </nav>

      <header className="mt-8 grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <div className="flex items-center">
            <Avatar name={a.card.displayName} src={a.card.photoDataUrl} size={64} shape="arch" ring="rose" eager />
            <Avatar name={b.card.displayName} src={b.card.photoDataUrl} size={64} shape="arch" ring="gold" eager className="-ml-3" />
          </div>
          <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            <Link href={`/pool/${pool}/p/${a.card.slug}`} className="hover:text-rose">
              {firstName(a.card.displayName)}
            </Link>{" "}
            &amp;{" "}
            <Link href={`/pool/${pool}/p/${b.card.slug}`} className="hover:text-gold">
              {firstName(b.card.displayName)}
            </Link>
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-mute">
            Their agents went out on their behalf. {firstName(a.card.displayName)}&apos;s agent asked.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill tone={date.mode === "full" ? "done" : "idle"} title={mode.detail}>
              {mode.label}
            </Pill>
            <span className="text-sm text-mute">{mode.detail}</span>
            {live && <Pill tone="work">Happening now</Pill>}
            {date.status === "failed" && <Pill tone="error">This date was cut short</Pill>}
          </div>
          {date.status === "failed" && date.error && <p className="mt-2 text-sm text-alarm">{date.error}</p>}
        </div>

        {/* Venue ticket */}
        <aside aria-label="Where they went" className="ticket rounded-[22px] bg-ink-2 p-6 ring-1 ring-line">
          {date.plan ? (
            <>
              <p className="flex items-center gap-1.5 text-sm text-mute">
                <PinIcon size={14} className="text-rose" /> Where the agents went
              </p>
              <p className="mt-2 font-display text-3xl leading-tight">{date.plan.venue}</p>
              <p className="mt-1 text-cream/90">{date.plan.activity}</p>
              <div className="mt-4 border-t border-dashed border-line pt-4">
                <p className="text-sm font-semibold">Why they picked it</p>
                <p className="mt-1 text-sm leading-relaxed text-mute">{date.plan.why}</p>
              </div>
              {date.plan.vibe && (
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {date.plan.vibe
                    .split(/[,;/]+/)
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .map((v) => (
                      <span key={v} className="rounded-full bg-ink-3 px-2.5 py-0.5 text-xs">
                        {v}
                      </span>
                    ))}
                </p>
              )}
            </>
          ) : (
            <p className="text-mute">The agents are still picking a place from both profiles.</p>
          )}
          {date.matchReason && (
            <p className="mt-4 border-t border-dashed border-line pt-4 text-xs leading-relaxed text-faint">
              Paired because: {date.matchReason} Profile overlap {Math.round(date.prescore * 100)}%.
            </p>
          )}
        </aside>
      </header>

      <div className="mt-12">
        <DateReplay date={date} a={a.card} b={b.card} acts={ACTS} pool={pool} />
      </div>
    </article>
  );
}
