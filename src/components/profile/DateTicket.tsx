import Link from "next/link";
import type { DateSummary } from "@/lib/views";
import { firstName, possessive } from "@/lib/ui/format";
import { Avatar } from "../Avatar";
import { MutualSeal, Pill } from "../Badges";

const DATE_STATUS: Record<string, string> = {
  planned: "Planned",
  in_progress: "Happening now",
  debriefing: "Writing debriefs",
  done: "Done",
  failed: "Didn't happen",
};

export function DateTicket({ pool, me, d }: { pool: string; me: string; d: DateSummary }) {
  const partner = d.partner;
  return (
    <li className="list-none">
      <Link
        href={`/pool/${pool}/date/${d.id}`}
        className="ticket group grid grid-cols-[6.5rem_1fr] overflow-hidden rounded-2xl bg-ink-2 transition-colors hover:bg-ink-3 sm:grid-cols-[8rem_1fr]"
      >
        <div className="flex flex-col items-center justify-center gap-2 border-r border-dashed border-line bg-rose/10 px-2 py-4 text-center">
          <Avatar name={partner.displayName} src={partner.photoDataUrl} size={48} />
          <span className="line-clamp-2 text-sm font-medium leading-tight">{partner.displayName}</span>
        </div>
        <div className="min-w-0 p-4 pl-5 pr-6">
          <div className="flex flex-wrap items-center gap-2">
            {d.mutual ? <MutualSeal size="sm" /> : d.status === "done" ? <Pill>Not a match</Pill> : null}
            {d.status !== "done" && <Pill tone={d.status === "failed" ? "error" : "work"}>{DATE_STATUS[d.status] ?? d.status}</Pill>}
            {d.mode === "compact" && <Pill title="Compact simulation (free-tier quota saver)">Compact</Pill>}
          </div>
          <p className="mt-2 font-display text-xl leading-tight">{d.plan?.venue ?? "Venue being chosen"}</p>
          {d.plan?.activity && <p className="mt-0.5 line-clamp-1 text-sm text-mute">{d.plan.activity}</p>}
          {(d.myDebrief || d.theirDebrief) && (
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-mute">{possessive(me)} agent</dt>
                <dd className="font-semibold tabular-nums text-rose">{d.myDebrief ? `${d.myDebrief.chemistry}/10` : "—"}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-mute">{possessive(partner.displayName)} agent</dt>
                <dd className="font-semibold tabular-nums text-gold">{d.theirDebrief ? `${d.theirDebrief.chemistry}/10` : "—"}</dd>
              </div>
            </dl>
          )}
          {d.myDebrief?.verdict && (
            <p className="mt-2 line-clamp-2 font-display text-[15px] italic leading-snug text-cream/90">“{d.myDebrief.verdict}”</p>
          )}
          <p className="mt-3 text-xs font-medium text-rose group-hover:underline group-hover:underline-offset-4">
            Watch {firstName(me)} and {firstName(partner.displayName)}&apos;s date
          </p>
        </div>
      </Link>
    </li>
  );
}
