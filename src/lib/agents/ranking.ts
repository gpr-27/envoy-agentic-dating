/**
 * Ranking (pure): "for every person, rank who fits them best".
 * Dated:     100 · (0.5·myChem/10 + 0.3·theirChem/10 + 0.2·prescore)
 * Projected: 100 · prescore · 0.8   (no date yet; labelled "projected")
 */
import type { DateRecord, Debrief, RankingEntry } from "@/lib/contracts";

/** Inputs for one person's ranking. */
export interface RankingInput {
  personId: string;
  /** Everyone else visible in the pool (hidden/removed people excluded by the caller). */
  candidateIds: string[];
  dates: DateRecord[];
  prescoreOf: (otherId: string) => number;
  /** Optional pre-score reasons for projected rationales. */
  reasonsOf?: (otherId: string) => string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function findDate(dates: DateRecord[], me: string, other: string): DateRecord | undefined {
  return dates
    .filter((d) => d.status === "done" && ((d.aId === me && d.bId === other) || (d.aId === other && d.bId === me)) && (d.debriefA || d.debriefB))
    .sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1))[0];
}

function datedRationale(mine: Debrief | null, theirs: Debrief | null): string {
  const d = mine ?? theirs;
  if (!d) return "";
  const clicked = d.clicked.slice(0, 2).join("; ");
  return [d.verdict, clicked ? `Clicked: ${clicked}.` : ""].filter(Boolean).join(" ");
}

/** Rank every candidate for `personId` (rank 1 = best fit). */
export function computeRankings(input: RankingInput): RankingEntry[] {
  const { personId } = input;
  const entries = input.candidateIds
    .filter((id) => id !== personId)
    .map((otherId): RankingEntry => {
      const prescore = Math.max(0, Math.min(1, input.prescoreOf(otherId)));
      const date = findDate(input.dates, personId, otherId);
      if (date) {
        const iAmA = date.aId === personId;
        const mine = iAmA ? date.debriefA : date.debriefB;
        const theirs = iAmA ? date.debriefB : date.debriefA;
        const my = (mine ?? theirs)!.chemistry;
        const their = (theirs ?? mine)!.chemistry;
        return {
          personId: otherId,
          rank: 0,
          score: round1(Math.min(100, 100 * (0.5 * (my / 10) + 0.3 * (their / 10) + 0.2 * prescore))),
          label: "dated",
          rationale: datedRationale(mine, theirs),
          mutual: Boolean(mine?.secondDate && theirs?.secondDate),
          myChemistry: mine?.chemistry ?? null,
          theirChemistry: theirs?.chemistry ?? null,
          prescore,
          dateId: date.id,
        };
      }
      const reasons = input.reasonsOf?.(otherId) ?? [];
      return {
        personId: otherId,
        rank: 0,
        score: round1(100 * prescore * 0.8),
        label: "projected",
        rationale: `Projected from the two profiles (no date yet)${reasons.length ? `: ${reasons.slice(0, 2).join("; ")}` : ""}.`,
        mutual: false,
        myChemistry: null,
        theirChemistry: null,
        prescore,
        dateId: null,
      };
    });
  entries.sort((x, y) => y.score - x.score || y.prescore - x.prescore || (x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : 0));
  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}
