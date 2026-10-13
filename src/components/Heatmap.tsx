"use client";

import Link from "next/link";
import { useState } from "react";
import type { PersonCard } from "@/lib/views";
import { firstName, possessive } from "@/lib/ui/format";
import { Avatar } from "./Avatar";

/** Sequential single-hue scale on the dark surface: dim plum -> rose. */
function fill(score: number) {
  const t = Math.max(0, Math.min(1, score / 100));
  const pct = Math.round(8 + t * 92);
  return `color-mix(in oklch, var(--color-rose) ${pct}%, var(--color-ink-2))`;
}

export function Heatmap({ pool, people, matrix }: { pool: string; people: PersonCard[]; matrix: Array<Array<number | null>> }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const cell = 30;
  const readout = hover
    ? (() => {
        const s = matrix[hover.i]?.[hover.j];
        const from = people[hover.i];
        const to = people[hover.j];
        if (!from || !to) return null;
        return s == null
          ? `${firstName(from.displayName)} has no score for ${firstName(to.displayName)} yet`
          : `${possessive(from.displayName)} ranking gives ${firstName(to.displayName)} ${Math.round(s)} out of 100`;
      })()
    : null;

  return (
    <div data-testid="heatmap">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-h-5 text-sm text-cream" aria-live="polite">
          {readout ?? <span className="text-mute">Hover a square to read it. Rows score columns. Click to open the row&apos;s profile.</span>}
        </p>
        <div className="flex items-center gap-2 text-xs text-mute" aria-hidden>
          <span>0</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${fill(0)}, ${fill(50)}, ${fill(100)})` }} />
          <span>100</span>
        </div>
      </div>
      <div className="scroll-quiet overflow-x-auto rounded-2xl border border-line bg-ink-2/60 p-3">
        <table className="border-separate" style={{ borderSpacing: 2 }} onMouseLeave={() => setHover(null)}>
          <caption className="sr-only">
            Compatibility scores. Each row is one person&apos;s ranking; each column is the person being scored.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ink-2" />
              {people.map((p, j) => (
                <th key={p.id} scope="col" className="p-0" style={{ width: cell }}>
                  <span
                    className={`mx-auto block w-fit rounded-full transition ${hover?.j === j ? "ring-2 ring-gold" : ""}`}
                    title={p.displayName}
                  >
                    <Avatar name={p.displayName} src={p.photoDataUrl} size={24} />
                  </span>
                  <span className="sr-only">{p.displayName}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((row, i) => (
              <tr key={row.id}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 bg-ink-2 pr-3 text-left text-xs font-medium whitespace-nowrap ${hover?.i === i ? "text-gold" : "text-cream/90"}`}
                >
                  <Link href={`/pool/${pool}/p/${row.slug}`} className="hover:underline">
                    {row.displayName}
                  </Link>
                </th>
                {people.map((col, j) => {
                  const s = matrix[i]?.[j] ?? null;
                  if (i === j) {
                    return (
                      <td key={col.id} style={{ width: cell, height: cell }} className="rounded-[5px] bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_6px)]" aria-label="Self" />
                    );
                  }
                  return (
                    <td key={col.id} className="p-0" style={{ width: cell, height: cell }}>
                      <Link
                        href={`/pool/${pool}/p/${row.slug}#ranking`}
                        onMouseEnter={() => setHover({ i, j })}
                        onFocus={() => setHover({ i, j })}
                        aria-label={s == null ? `${row.displayName} to ${col.displayName}: no score` : `${row.displayName} scores ${col.displayName} ${Math.round(s)}`}
                        className={`block rounded-[5px] transition-transform hover:scale-110 focus-visible:scale-110 ${hover?.i === i && hover?.j === j ? "ring-2 ring-cream" : ""}`}
                        style={{ width: cell, height: cell, background: s == null ? "transparent" : fill(s), boxShadow: s == null ? "inset 0 0 0 1px var(--color-line)" : undefined }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

