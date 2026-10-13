import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Quality, Trait } from "@/lib/contracts";
import { Avatar } from "@/components/Avatar";
import { ConfidenceBadge, IdentityBadge, StatusChip } from "@/components/Badges";
import { ExternalIcon, InstagramIcon, LinkedInIcon, PinIcon } from "@/components/Icons";
import { PipelineMonitor } from "@/components/PipelineMonitor";
import { RemovePerson } from "@/components/RemovePerson";
import { DateTicket } from "@/components/profile/DateTicket";
import { RankingList } from "@/components/profile/RankingList";
import { ReadingLogReplay } from "@/components/profile/ReadingLog";
import { SourcesPanel } from "@/components/profile/SourcesPanel";
import { TraitItem } from "@/components/profile/Traits";
import { isPool } from "@/lib/store";
import { firstName, possessive, QUALITY_LABEL, statusInfo } from "@/lib/ui/format";
import { getPersonView, type PersonView } from "@/lib/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pool/[pool]/p/[slug]">): Promise<Metadata> {
  const { pool, slug } = await params;
  if (!isPool(pool)) return {};
  const view = await getPersonView(pool, slug).catch(() => null);
  return { title: view ? view.card.displayName : "Profile" };
}

function SourceLinks({ view }: { view: PersonView }) {
  const { person } = view;
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={person.linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm transition hover:border-[#9cc6ee]"
      >
        <LinkedInIcon size={14} className="text-[#9cc6ee]" /> LinkedIn <ExternalIcon size={11} className="text-faint" />
      </a>
      <a
        href={person.instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm transition hover:border-rose"
      >
        <InstagramIcon size={14} className="text-rose" /> @{person.instagramHandle}{" "}
        <ExternalIcon size={11} className="text-faint" />
      </a>
    </div>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-2xl">
      <h2 id={id} className="font-display text-4xl leading-tight sm:text-5xl">
        {title}
      </h2>
      {children && <p className="mt-3 leading-relaxed text-mute">{children}</p>}
    </div>
  );
}

function TraitSection({
  testid,
  title,
  blurb,
  traits,
  ctx,
  accent,
}: {
  testid: string;
  title: string;
  blurb: string;
  traits: Trait[];
  ctx: { experience: Array<{ title: string; company: string }>; posts: number } | null;
  accent?: "rose" | "gold";
}) {
  return (
    <section data-testid={testid} className="grid gap-5 border-t border-line pt-8 lg:grid-cols-[15rem_1fr]">
      <div>
        <h3 className="font-display text-3xl">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-mute">{blurb}</p>
      </div>
      <ul className="grid items-start gap-3 sm:grid-cols-2">
        {traits.map((t, i) => (
          <TraitItem key={`${t.label}-${i}`} trait={t} ctx={ctx} accent={accent} />
        ))}
      </ul>
    </section>
  );
}

function QualitiesSection({
  qualities,
  ctx,
}: {
  qualities: Quality[];
  ctx: { experience: Array<{ title: string; company: string }>; posts: number } | null;
}) {
  const groups = new Map<string, Quality[]>();
  for (const q of qualities) groups.set(q.category, [...(groups.get(q.category) ?? []), q]);
  return (
    <section data-testid="profile-qualities" className="grid gap-5 border-t border-line pt-8 lg:grid-cols-[15rem_1fr]">
      <div>
        <h3 className="font-display text-3xl">Other qualities</h3>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Values, personality and style the agent picked up on, grouped by kind.
        </p>
      </div>
      <div className="space-y-6">
        {[...groups.entries()].map(([cat, qs]) => (
          <div key={cat}>
            <h4 className="mb-2.5 text-sm font-semibold text-gold">{QUALITY_LABEL[cat] ?? cat}</h4>
            <ul className="grid items-start gap-3 sm:grid-cols-2">
              {qs.map((q, i) => (
                <TraitItem key={`${q.label}-${i}`} trait={q} ctx={ctx} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function NoteList({ title, items, tone }: { title: string; items: string[]; tone: "mint" | "alarm" | "gold" | "cream" }) {
  if (!items.length) return null;
  const mark = { mint: "bg-mint", alarm: "bg-alarm", gold: "bg-gold", cream: "bg-cream" }[tone];
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-cream/90">
            <span aria-hidden className={`mt-2 size-1.5 shrink-0 rounded-full ${mark}`} />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function ProfilePage({ params }: PageProps<"/pool/[pool]/p/[slug]">) {
  const { pool, slug } = await params;
  if (!isPool(pool)) notFound();
  const view = await getPersonView(pool, slug);
  if (!view) notFound();

  const { person, card, profile, sources, dates, ranking, frozen } = view;
  const name = card.displayName;
  const first = firstName(name);
  const a = profile?.analysis ?? null;
  const ctx = sources
    ? { experience: sources.linkedin.experience, posts: sources.instagram.posts.length }
    : null;

  return (
    <article className="mx-auto max-w-6xl px-5 pb-10 pt-10">
      <nav aria-label="Breadcrumb" className="text-sm text-mute">
        <Link href={`/pool/${pool}`} className="hover:text-cream">
          {pool === "demo" ? "The finished demo" : "The live pool"}
        </Link>
        <span aria-hidden className="mx-2 text-faint">/</span>
        <span className="text-cream">{name}</span>
      </nav>

      {/* Header */}
      <header className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-[auto_1fr] sm:items-end">
        <Avatar name={name} src={card.photoDataUrl} size={140} shape="arch" ring="rose" eager className="motion-safe:animate-rise" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {a ? (
              <>
                <IdentityBadge samePerson={a.identity.samePerson} reasons={a.identity.reasons} />
                <ConfidenceBadge level={a.confidence} className="ml-1" />
              </>
            ) : (
              <StatusChip status={person.status} />
            )}
          </div>
          <h1 className="mt-3 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">{name}</h1>
          {a?.tagline && <p className="mt-3 max-w-2xl font-display text-xl italic leading-snug text-cream/90 sm:text-2xl">{a.tagline}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            {(a?.location || card.location) && (
              <span className="inline-flex items-center gap-1.5 text-sm text-mute">
                <PinIcon size={14} /> {a?.location || card.location}
              </span>
            )}
            <SourceLinks view={view} />
          </div>
          {profile && profile.models.length > 0 && (
            <p className="mt-4 text-xs text-faint">Read by {profile.models.join(", ")}</p>
          )}
        </div>
      </header>

      {!profile || !a ? (
        <section className="mt-12 space-y-6">
          <div className="rounded-[22px] border border-line bg-ink-2 p-6">
            <h2 className="font-display text-3xl">
              {["rejected_private", "rejected_invalid", "failed"].includes(person.status)
                ? `The agent couldn't read ${first}`
                : person.status === "identity_mismatch"
                  ? `Are these the same person?`
                  : `${possessive(name)} profile isn't ready yet`}
            </h2>
            <p className="mt-2 text-mute">{person.statusDetail || statusInfo(person.status).description}</p>
            {person.error && person.error !== (person.statusDetail || statusInfo(person.status).description) && (
              <p className="mt-2 text-sm text-alarm">{person.error}</p>
            )}
          </div>
          {!frozen && <PipelineMonitor pool={pool} frozen={frozen} focusId={person.id} />}
          <RemovePerson id={person.id} pool={pool} name={first} />
        </section>
      ) : (
        <>
          <p className="mt-10 max-w-3xl text-lg leading-relaxed text-cream/90">{a.summary}</p>

          <nav aria-label="On this page" className="z-30 -mx-5 mt-10 sm:sticky sm:top-[57px] border-y border-line/70 bg-ink/90 px-5 backdrop-blur-md">
            <ul className="scroll-quiet flex gap-1 overflow-x-auto py-2 text-sm">
              {[
                ["#reading", "The reading"],
                ["#analysis", "The analysis"],
                ["#dates", `Dates (${dates.length})`],
                ["#ranking", "Who fits best"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="block whitespace-nowrap rounded-full px-3 py-1.5 text-mute hover:bg-ink-3 hover:text-cream">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Reading */}
          <section id="reading" aria-labelledby="reading-h" className="scroll-mt-32 pt-16">
            <SectionHead id="reading-h" title={`How the agent read ${first}`}>
              The agent only gets two sources: the public LinkedIn and the public Instagram. Here is what it looked at,
              in order, and what it noticed. Hover or click any evidence chip to see where it came from.
            </SectionHead>
            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
              <ReadingLogReplay log={profile.readingLog} name={first} ctx={ctx} />
              <aside aria-label="Sources the agent read" className="lg:sticky lg:top-32">
                <h3 className="mb-3 text-sm font-medium text-mute">Sources the agent read</h3>
                {sources ? (
                  <div className="scroll-quiet lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-1">
                    <SourcesPanel sources={sources} />
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-mute">
                    The raw pages for this person aren&apos;t stored here. The links above open the originals.
                  </p>
                )}
              </aside>
            </div>
          </section>

          {/* Analysis */}
          <section id="analysis" aria-labelledby="analysis-h" className="scroll-mt-32 pt-24">
            <SectionHead id="analysis-h" title={`What the agent found`}>
              Every item cites where it came from. Open the evidence on any card to see the quote and the source.
            </SectionHead>
            <div className="space-y-10">
              <TraitSection
                testid="profile-needs"
                title="Needs"
                blurb={`What ${first} needs from a partner, inferred from both profiles.`}
                traits={a.needs}
                ctx={ctx}
                accent="gold"
              />
              <TraitSection
                testid="profile-hobbies"
                title="Hobbies"
                blurb={`What ${first} actually spends time doing.`}
                traits={a.hobbies}
                ctx={ctx}
              />
              <TraitSection
                testid="profile-interests"
                title="Interests"
                blurb={`Topics and worlds ${first} cares about.`}
                traits={a.interests}
                ctx={ctx}
              />
              <QualitiesSection qualities={a.otherQualities} ctx={ctx} />
            </div>

            <div className="mt-14 grid gap-10 rounded-[24px] border border-line bg-ink-2/60 p-6 sm:p-8 md:grid-cols-2">
              <NoteList title="Green flags" items={a.greenFlags} tone="mint" />
              <NoteList title="Possible dealbreakers" items={a.possibleDealbreakers} tone="alarm" />
              <NoteList title="Conversation hooks" items={a.conversationHooks} tone="gold" />
              <div className="space-y-6">
                {a.idealFirstDate && (
                  <div>
                    <h3 className="font-semibold">Ideal first date</h3>
                    <p className="mt-2 font-display text-xl italic leading-snug">{a.idealFirstDate}</p>
                  </div>
                )}
                {profile.readingLog.firstImpression && (
                  <div>
                    <h3 className="font-semibold">First impression</h3>
                    <p className="mt-2 text-sm leading-relaxed text-cream/90">{profile.readingLog.firstImpression}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Dates */}
          <section id="dates" aria-labelledby="dates-h" className="scroll-mt-32 pt-24">
            <SectionHead id="dates-h" title={`${possessive(name)} dates`}>
              {`${possessive(name)} agent went out with these agents on ${first}'s behalf. Each agent scored the chemistry privately afterwards.`}
            </SectionHead>
            {dates.length ? (
              <ul data-testid="dates-list" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {dates.map((d) => (
                  <DateTicket key={d.id} pool={pool} me={name} d={d} />
                ))}
              </ul>
            ) : (
              <p data-testid="dates-list" className="rounded-2xl border border-dashed border-line p-6 text-mute">
                No dates yet. {frozen ? "" : "Send the agents on a round of dates from the pool page."}
              </p>
            )}
          </section>

          {/* Ranking */}
          <section id="ranking" aria-labelledby="ranking-h" className="scroll-mt-32 pt-24">
            <SectionHead id="ranking-h" title={`Ranking — who fits ${first} best`}>
              Dated scores combine {possessive(name)} agent&apos;s chemistry (50%), the other agent&apos;s chemistry
              (30%) and profile overlap (20%). Projected means they haven&apos;t been on a date yet, so the score is
              estimated from profile overlap alone and capped at 80.
            </SectionHead>
            {ranking.length ? (
              <RankingList pool={pool} me={name} ranking={ranking} />
            ) : (
              <p data-testid="ranking-list" className="rounded-2xl border border-dashed border-line p-6 text-mute">
                The ranking appears once {possessive(name)} agent has been on dates.
              </p>
            )}
          </section>

          <section className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8">
            <p className="max-w-lg text-sm text-mute">
              Built only from {possessive(name)} public LinkedIn and Instagram. If this is you, or you&apos;d rather
              they weren&apos;t here, remove them.
            </p>
            <RemovePerson id={person.id} pool={pool} name={first} />
          </section>
        </>
      )}
    </article>
  );
}
