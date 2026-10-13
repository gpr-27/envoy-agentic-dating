/**
 * The agent harness: Reader (read + synthesize), Matchmaker (pre-score +
 * pairing), the Date (plan, turns, debriefs, compact mode) and Ranking.
 */
export { readPerson, synthesizeProfile } from "./reader";
export { prescore, compatible, pickDates, pairKey, type DatePick, type PoolMember } from "./matchmaker";
export { planDate, nextTurn, debrief, compactDate, turnMeta } from "./date";
export { computeRankings, type RankingInput } from "./ranking";
export { identitySignals, type IdentitySignals } from "./format";
