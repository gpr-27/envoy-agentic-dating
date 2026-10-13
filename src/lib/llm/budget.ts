/**
 * Daily budget view used by the pipeline to pick a date mode and to show
 * "waiting for quota" notices. Remaining calls per model are the minimum of
 * the request budget (RPD) and the token budget (TPD / typical call size).
 */
import type { DateMode } from "@/lib/contracts";
import { getChain, rpdFor, specId, tpdFor, type ChainName } from "./config";
import { getProvider } from "./router";
import { getUsageCounter, tokenKey, usageKey } from "./usage";

/** Remaining capacity today for one model. */
export interface ModelBudget {
  id: string;
  requestsUsed: number;
  requestCap: number;
  tokensUsed: number;
  tokenCap: number;
  available: boolean;
}

/** Remaining calls today per chain (sum over available models). */
export interface BudgetSnapshot {
  analysis: number;
  date: number;
  debrief: number;
  models: ModelBudget[];
}

/** Calls a full date needs on the DATE chain (1 plan + 8 turns) plus headroom. */
export const FULL_DATE_MIN_CALLS = 12;

/** Typical tokens per call (input + output) for each chain, used to convert TPD into calls. */
export const TYPICAL_CALL_TOKENS: Record<ChainName, number> = { analysis: 7000, date: 1600, debrief: 2000 };

function callsLeft(mb: ModelBudget, chain: ChainName): number {
  if (!mb.available) return 0;
  const byReq = mb.requestCap - mb.requestsUsed;
  const byTok = (mb.tokenCap - mb.tokensUsed) / TYPICAL_CALL_TOKENS[chain];
  return Math.max(0, Math.floor(Math.min(byReq, byTok)));
}

/** Remaining capacity today for each task chain. Infinity in mock mode. */
export async function getBudgetSnapshot(): Promise<BudgetSnapshot> {
  const counter = getUsageCounter();
  const seen = new Map<string, ModelBudget>();
  const totals: Record<ChainName, number> = { analysis: 0, date: 0, debrief: 0 };
  for (const name of Object.keys(totals) as ChainName[]) {
    for (const spec of getChain(name)) {
      const id = specId(spec);
      let mb = seen.get(id);
      if (!mb) {
        mb = {
          id,
          requestsUsed: await counter.get(usageKey(spec)),
          requestCap: rpdFor(spec),
          tokensUsed: await counter.get(tokenKey(spec)),
          tokenCap: tpdFor(spec),
          available: getProvider(spec.provider)?.isAvailable() ?? false,
        };
        seen.set(id, mb);
      }
      totals[name] += callsLeft(mb, name);
    }
  }
  return { ...totals, models: [...seen.values()] };
}

/** "compact" when today's remaining DATE-chain capacity can't cover a full date. */
export async function chooseDateMode(snapshot?: BudgetSnapshot): Promise<DateMode> {
  const s = snapshot ?? (await getBudgetSnapshot());
  return s.date < FULL_DATE_MIN_CALLS ? "compact" : "full";
}
