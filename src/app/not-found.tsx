import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-28 text-center">
      <p className="font-display text-7xl italic text-rose">Stood up.</p>
      <h1 className="mt-6 text-xl font-semibold">This page isn&apos;t here.</h1>
      <p className="mt-3 text-mute">
        The person may have been removed, or the link is wrong. Profiles disappear immediately when someone uses
        &ldquo;Remove this person&rdquo;.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/pool/demo" className="rounded-full bg-rose px-5 py-2.5 font-semibold text-ink hover:bg-cream">
          Open the finished demo
        </Link>
        <Link href="/" className="rounded-full border border-line px-5 py-2.5 hover:border-cream">
          Go to the start
        </Link>
      </div>
    </section>
  );
}
