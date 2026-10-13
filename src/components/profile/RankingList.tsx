import Link from "next/link";
import type { RankedCandidate } from "@/lib/views";
import { firstName } from "@/lib/ui/format";
import { Avatar } from "../Avatar";
import { MutualSeal, Pill, ScoreBar } from "../Badges";

export function RankingList({ pool, me, ranking }: { pool: string; me: string; ranking: RankedCandidate[] }) {
  return (
    <ol data-testid="ranking-list" className="divide-y divide-line/70 border-y border-line/70">
      {ranking.map((e) => (
        <li
          key={e.personId}
          data-testid="ranking-entry"
          data-label={e.label}
          className="grid grid-cols-[2.5rem_1fr] gap-x-3 gap-y-2 py-4 sm:grid-cols-[3.5rem_1fr_12rem] sm:items-center"
        >
          <span
            className={`text-2xl font-semibold tracking-tight tabular-nums leading-none sm:text-3xl ${e.rank <= 3 ? "text-gold" : "text-faint"}`}
            aria-label={`Rank ${e.rank}`}
          >
            {e.rank}
          </span>
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={e.candidate.displayName} src={e.candidate.photoDataUrl} size={44} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/pool/${pool}/p/${e.candidate.slug}`} className="font-medium hover:text-rose hover:underline">
                  {e.candidate.displayName}
                </Link>
                {e.label === "dated" ? (
                  <Pill tone="done" title="Score from both agents' private debriefs after a real date">
                    Dated
                  </Pill>
                ) : (
                  <Pill title="Not dated yet: estimated from profile overlap">Projected</Pill>
                )}
                {e.mutual && <MutualSeal size="sm" />}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-mute">{e.rationale}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                {e.myChemistry != null && <span>
                    {firstName(me)}&apos;s agent {e.myChemistry}/10
                  </span>}
                {e.theirChemistry != null && (
                  <span>
                    {firstName(e.candidate.displayName)}&apos;s agent {e.theirChemistry}/10
                  </span>
                )}
                <span>Profile overlap {Math.round(e.prescore * 100)}%</span>
                {e.dateId && (
                  <Link href={`/pool/${pool}/date/${e.dateId}`} className="text-rose hover:underline">
                    Watch the date
                  </Link>
                )}
              </p>
            </div>
          </div>
          <div className="col-start-2 sm:col-start-3">
            <ScoreBar score={e.score} tone={e.label === "dated" ? "rose" : "mute"} />
          </div>
        </li>
      ))}
    </ol>
  );
}
