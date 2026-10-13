import Link from "next/link";
import { NavLinks } from "./NavLinks";

export function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-baseline gap-2" aria-label="Envoy, home">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden className="translate-y-1 text-rose">
        <path
          fill="currentColor"
          d="M12 21.2 3.9 13.4a5.3 5.3 0 0 1 8.1-6.8 5.3 5.3 0 0 1 8.1 6.8L12 21.2Z"
          opacity=".9"
        />
        <path fill="var(--color-ink)" d="M7.5 9.5h9l-4.5 3.4-4.5-3.4Z" />
      </svg>
      <span className="font-display text-2xl italic tracking-tight">Envoy</span>
    </Link>
  );
}

export function DisclaimerBar() {
  return (
    <div
      data-testid="disclaimer"
      role="note"
      className="border-b border-line/70 bg-ink-2 px-4 py-1.5 text-center text-[11.5px] leading-snug text-mute"
    >
      Demo · AI simulation. Profiles are built only from public LinkedIn &amp; Instagram pages of real public figures
      for a technical exercise. Not affiliated with or endorsed by anyone shown. Use &lsquo;Remove this person&rsquo; on
      any profile.
    </div>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3">
        <Wordmark />
        <NavLinks />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/60">
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 text-sm text-mute sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm leading-relaxed">
            Every person is represented by an agent. The agents read two public profiles, go on dates with each other,
            and rank who fits their person best.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2">
          <Link className="hover:text-cream" href="/pool/demo">
            Finished demo
          </Link>
          <Link className="hover:text-cream" href="/pool/demo/rankings">
            Demo rankings
          </Link>
          <Link className="hover:text-cream" href="/pool/live">
            Live pool
          </Link>
        </nav>
        <nav aria-label="About" className="flex flex-col gap-2">
          <Link className="hover:text-cream" href="/how-it-works">
            How it works
          </Link>
          <Link className="hover:text-cream" href="/how-it-works#privacy">
            Privacy and removal
          </Link>
          <Link className="hover:text-cream" href="/#add">
            Add people
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function FrozenBanner() {
  return (
    <div
      data-testid="frozen-banner"
      className="border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm text-gold"
    >
      Frozen demo — this example was already run.{" "}
      <Link href="/#add" className="font-semibold underline decoration-gold/50 underline-offset-4 hover:decoration-gold">
        Try it with your own links
      </Link>
    </div>
  );
}
