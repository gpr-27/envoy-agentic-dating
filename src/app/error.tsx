"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="mx-auto max-w-2xl px-5 py-28 text-center" role="alert">
      <p className="font-display text-6xl italic text-gold">A missed connection.</p>
      <h1 className="mt-6 text-xl font-semibold">This page failed to load.</h1>
      <p className="mt-3 text-mute">
        The server hit an error while building this page{error.digest ? ` (reference ${error.digest})` : ""}. Try
        again; if it keeps happening, the finished demo still works without the database.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-rose px-5 py-2.5 font-semibold text-ink hover:bg-cream"
        >
          Try again
        </button>
        <Link href="/pool/demo" className="rounded-full border border-line px-5 py-2.5 hover:border-cream">
          Open the finished demo
        </Link>
      </div>
    </section>
  );
}
