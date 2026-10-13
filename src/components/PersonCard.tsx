import Link from "next/link";
import type { PersonCard as Card } from "@/lib/views";
import { Avatar } from "./Avatar";
import { StatusChip } from "./Badges";

export function PersonCard({ pool, card }: { pool: string; card: Card }) {
  return (
    <li data-testid="person-card" className="list-none">
      <Link
        href={`/pool/${pool}/p/${card.slug}`}
        className="group flex h-full gap-4 rounded-[22px] border border-line bg-ink-2/70 p-4 transition-colors hover:border-rose/60 hover:bg-ink-2"
      >
        <Avatar name={card.displayName} src={card.photoDataUrl} size={64} shape="arch" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-xl leading-tight group-hover:text-rose">{card.displayName}</h3>
          </div>
          {card.tagline ? (
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-mute">{card.tagline}</p>
          ) : (
            <p className="mt-1 text-sm text-faint">@{card.instagramHandle}</p>
          )}
          {card.topHobbies.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Top hobbies">
              {card.topHobbies.map((h) => (
                <li key={h} className="rounded-full bg-ink-3 px-2 py-0.5 text-xs text-cream/90">
                  {h}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusChip status={card.status} />
            {card.location && <span className="truncate text-xs text-faint">{card.location}</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}
