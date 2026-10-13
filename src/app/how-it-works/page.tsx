import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { InstagramIcon, LinkedInIcon } from "@/components/Icons";

export const metadata: Metadata = { title: "How it works" };

const TOC = [
  ["sources", "The two sources"],
  ["reader", "The reader agent"],
  ["representatives", "The representative agents"],
  ["date", "The date"],
  ["ranking", "The ranking"],
  ["scraping", "Scraping stack"],
  ["models", "Models"],
  ["infra", "Infrastructure"],
  ["privacy", "Privacy"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line py-12">
      <h2 id={`${id}-h`} className="font-display text-4xl leading-tight">
        {title}
      </h2>
      <div className="mt-5 max-w-[68ch] space-y-4 leading-relaxed text-cream/90">{children}</div>
    </section>
  );
}

function Node({ title, sub, tone = "line" }: { title: string; sub: string; tone?: "line" | "rose" | "gold" }) {
  const border = tone === "rose" ? "border-rose/60 bg-rose/10" : tone === "gold" ? "border-gold/60 bg-gold/10" : "border-line bg-ink-2";
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 ${border}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs leading-snug text-mute">{sub}</p>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="flex items-center justify-center text-rose max-md:h-6 md:w-6">
      <svg width="16" height="16" viewBox="0 0 16 16" className="max-md:rotate-90">
        <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function PipelineDiagram() {
  return (
    <figure className="rounded-[24px] border border-line bg-ink-2/50 p-5">
      <div className="flex flex-col items-stretch md:flex-row md:items-center">
        <div className="space-y-2 md:w-36">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm">
            <LinkedInIcon size={14} className="text-[#9cc6ee]" /> LinkedIn
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm">
            <InstagramIcon size={14} className="text-rose" /> Instagram
          </div>
        </div>
        <Arrow />
        <div className="md:flex-1">
          <Node title="Apify scrapers" sub="Public data only, PII stripped" />
        </div>
        <Arrow />
        <div className="md:flex-1">
          <Node title="Reader agent" sub="Read pass, then synthesis pass" tone="rose" />
        </div>
        <Arrow />
        <div className="md:flex-1">
          <Node title="Profile page" sub="Needs, hobbies, interests, qualities" />
        </div>
        <Arrow />
        <div className="md:flex-1">
          <Node title="Dates" sub="Agent vs agent, 3 acts, private debriefs" tone="rose" />
        </div>
        <Arrow />
        <div className="md:flex-1">
          <Node title="Ranking" sub="Everyone, for everyone" tone="gold" />
        </div>
      </div>
      <figcaption className="mt-4 text-xs text-faint">
        Every step is a resumable pipeline stage. Each person moves through it on their own.
      </figcaption>
    </figure>
  );
}

function DateDiagram() {
  return (
    <figure className="grid gap-3 rounded-[24px] border border-line bg-ink-2/50 p-5 sm:grid-cols-[1fr_1.2fr_1fr]">
      <div className="rounded-xl border border-rose/50 bg-rose/10 p-3.5 text-sm">
        <p className="font-semibold text-rose">Agent A</p>
        <p className="mt-1 text-xs leading-relaxed text-mute">Knows only A&apos;s profile and private agenda: needs to probe, dealbreakers, hooks.</p>
      </div>
      <div className="rounded-xl border border-line bg-ink p-3.5 text-sm">
        <p className="font-semibold">Shared: venue plan and transcript</p>
        <ol className="mt-2 space-y-1 text-xs text-mute">
          <li>Act 1, arriving and icebreakers</li>
          <li>Act 2, values, goals and dealbreakers</li>
          <li>Act 3, a week together and the goodbye</li>
        </ol>
      </div>
      <div className="rounded-xl border border-gold/50 bg-gold/10 p-3.5 text-sm">
        <p className="font-semibold text-gold">Agent B</p>
        <p className="mt-1 text-xs leading-relaxed text-mute">Knows only B&apos;s profile and private agenda. Never sees A&apos;s notes.</p>
      </div>
      <figcaption className="text-xs text-faint sm:col-span-3">
        Each turn is a separate model call made as one agent. Private thoughts and debriefs never cross over.
      </figcaption>
    </figure>
  );
}

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-10 pt-12">
      <header className="max-w-3xl">
        <h1 className="font-display text-5xl leading-[0.95] sm:text-7xl">How it works</h1>
        <p className="mt-5 text-lg leading-relaxed text-mute">
          Each person is represented by an agent. The agent reads its person from two public profiles, then goes on
          dates with other agents on that person&apos;s behalf. Afterwards every agent ranks who fits its person best.
        </p>
      </header>

      <div className="mt-10">
        <PipelineDiagram />
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 pt-12 text-sm">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-mute hover:bg-ink-3 hover:text-cream">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <Section id="sources" title="The two sources">
            <p>
              Every person goes in as exactly two official links: their LinkedIn profile and the Instagram that belongs
              to them. Nothing else. The agents have no web search and no other tools, and every claim on a profile has
              to point back to a LinkedIn section or an Instagram post.
            </p>
            <p>
              Only public Instagram accounts are allowed. Private accounts are rejected before any analysis, and the
              link checker refuses shortlinks, company pages and post links with a clear message for each line.
            </p>
          </Section>

          <Section id="reader" title="The reader agent">
            <p>
              The reader works in two passes. The <strong>read pass</strong> goes through the LinkedIn headline, about,
              experience, education and skills, then the Instagram bio and latest posts (captions, hashtags,
              locations, and the images themselves when the model supports vision). It writes a reading log: what it
              looked at, what it noticed, and the evidence.
            </p>
            <p>
              The <strong>synthesis pass</strong> turns that log into the profile: needs, hobbies, interests and other
              qualities, each with a confidence level and at least one piece of evidence (source, reference and
              quote). It also writes green flags, possible dealbreakers, conversation hooks and an ideal first date.
            </p>
            <p>
              Finally it runs an <strong>identity check</strong>: do the LinkedIn and Instagram belong to the same
              person? It compares names, locations and cross-links. If it looks like two different people, the profile
              pauses until someone confirms.
            </p>
          </Section>

          <Section id="representatives" title="The representative agents">
            <p>
              On a date, each person is represented by their own agent. That agent&apos;s instructions are built only
              from its person&apos;s profile, plus a private agenda: which needs to probe, which dealbreakers to watch
              for, and which hooks to bring up.
            </p>
            <p>
              An agent never sees the other person&apos;s analysis, and it may not invent facts. If it doesn&apos;t know
              something about its person, it says so.
            </p>
          </Section>

          <Section id="date" title="The date">
            <DateDiagram />
            <p>
              A matchmaker pairs people using profile overlap (shared hobbies, interests and values, plus complementary
              traits), respecting who each person is interested in. Every person gets at least one date per round.
            </p>
            <p>
              The two agents first agree on a venue and activity from both profiles, with a reason that cites each
              side. Then they talk for <strong>8 turns over 3 acts</strong>. Every turn is a separate model call made
              as that agent alone, with its own profile, agenda and the transcript so far. With each line the agent
              keeps a private thought and a vibe score from 0 to 10, which is what the replay&apos;s vibe meter shows.
            </p>
            <p>
              After the goodbye, each agent writes a private debrief for its person: chemistry out of 10, what clicked,
              concerns, a one-line verdict, and whether it wants a second date. When both say yes, it&apos;s mutual.
            </p>
            <p className="text-sm text-mute">
              When free-tier quota runs low, a date can run in compact mode: one call writes the conversation with
              strict role separation, and the two debriefs are still separate calls. The replay labels which mode was
              used.
            </p>
          </Section>

          <Section id="ranking" title="The ranking">
            <p>For every person, every other person in the pool is ranked. For someone they dated:</p>
            <p className="rounded-2xl border border-gold/40 bg-gold/5 px-5 py-4 text-lg font-medium leading-snug text-cream">
              score = 100 × (0.5 × my agent&apos;s chemistry + 0.3 × their agent&apos;s chemistry + 0.2 × profile prescore)
            </p>
            <p>
              Chemistry is the debrief score divided by 10. Your own agent&apos;s view counts most, but a date only
              scores well if the other side felt it too.
            </p>
            <p>
              People they haven&apos;t dated yet are still ranked, labelled <strong>projected</strong>: score = 80 ×
              prescore. Capping guesses at 80 means a genuinely good date always outranks a guess.
            </p>
          </Section>

          <Section id="scraping" title="Scraping stack">
            <p>
              Scraping runs on <strong>Apify</strong>. Instagram uses <code className="text-gold">apify/instagram-profile-scraper</code>{" "}
              (bio, counts, privacy flag and the latest posts). LinkedIn uses{" "}
              <code className="text-gold">supreme_coder/linkedin-profile-scraper</code>, with{" "}
              <code className="text-gold">bovi/linkedin-profile-scraper</code> as a fallback.
            </p>
            <p>
              Runs are started asynchronously and in batches, so pasting a whole list costs a few actor runs rather
              than one per person. Raw output is normalized into one shape and emails and phone numbers are stripped.
              Instagram images are captured as small thumbnails at scrape time, because Instagram&apos;s image links
              expire.
            </p>
          </Section>

          <Section id="models" title="Models">
            <p>
              Everything runs on free tiers. <strong>Gemini</strong> is the primary model family, with{" "}
              <strong>Groq</strong> free-tier models as the fallback. Reading, dating and debriefing each have their
              own ordered chain of models.
            </p>
            <p>
              A per-model rate limiter tracks requests and tokens per minute and per day. When one model is out of
              quota the next one takes over; when all are out, people show &ldquo;Paused for quota&rdquo; and resume
              automatically.
            </p>
          </Section>

          <Section id="infra" title="Infrastructure">
            <p>
              Next.js on Vercel, with Supabase Postgres for the live pool. The pipeline is a set of short, resumable
              ticks: each one advances a few people or dates by one step and saves the result, so no request runs long
              and nothing is lost if one fails. Your browser drives the ticks while you watch the live pool.
            </p>
            <p>
              The demo pool is a frozen snapshot bundled with the site. It renders without the database, and visitors
              can&apos;t change it, except to remove a person.
            </p>
          </Section>

          <Section id="privacy" title="Privacy">
            <ul className="list-disc space-y-2 pl-5">
              <li>Only public data from the two links. Private Instagram accounts are rejected.</li>
              <li>Emails and phone numbers are stripped before anything is stored or shown.</li>
              <li>Every page is marked noindex, so none of this shows up in search engines.</li>
              <li>
                Every profile has a <strong>Remove this person</strong> button. It removes them from the pool, their
                dates and every ranking straight away.
              </li>
              <li>
                Everything here is an AI simulation for a technical exercise. Nobody shown is affiliated with or
                endorses it.
              </li>
            </ul>
          </Section>

          <div className="flex flex-wrap gap-3 border-t border-line pt-10">
            <Link href="/pool/demo" className="rounded-full bg-rose px-5 py-2.5 font-semibold text-ink hover:bg-cream">
              Open the finished demo
            </Link>
            <Link href="/#add" className="rounded-full border border-line px-5 py-2.5 hover:border-cream">
              Add your own people
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
