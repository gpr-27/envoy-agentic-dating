"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PoolStatus } from "@/lib/contracts";
import { api } from "@/lib/ui/api";
import { firstName, isReady, possessive, statusInfo } from "@/lib/ui/format";
import { Avatar } from "./Avatar";
import { StatusChip } from "./Badges";

interface TickResponse {
  progressed: number;
  pendingWork: boolean;
  notice: string | null;
  log: string[];
}
interface FeedLine {
  id: number;
  at: string;
  text: string;
  tone: "info" | "good" | "bad";
}

type P = PoolStatus["people"][number];

function transitionLine(p: P): { text: string; tone: FeedLine["tone"] } {
  const n = firstName(p.displayName);
  switch (p.status) {
    case "queued":
      return { text: `${n} joined the line`, tone: "info" };
    case "scraping":
      return { text: `Fetching ${possessive(p.displayName)} LinkedIn and Instagram…`, tone: "info" };
    case "scraped":
      return { text: `Got ${possessive(p.displayName)} pages. Handing them to the reader agent`, tone: "info" };
    case "analyzing":
      return { text: `Reading ${possessive(p.displayName)} LinkedIn and Instagram…`, tone: "info" };
    case "profiled":
      return { text: `${possessive(p.displayName)} profile page is ready`, tone: "good" };
    case "dating":
      return { text: `${possessive(p.displayName)} agent is out on a date`, tone: "info" };
    case "ranked":
      return { text: `${possessive(p.displayName)} ranking is in`, tone: "good" };
    case "rejected_private":
      return { text: `${n}: Instagram is private — only public profiles are allowed`, tone: "bad" };
    case "rejected_invalid":
      return { text: `${n}: ${p.error ?? "one of the links isn't a readable public profile"}`, tone: "bad" };
    case "identity_mismatch":
      return { text: `${n}: the LinkedIn and Instagram may be different people`, tone: "bad" };
    case "failed":
      return { text: `${n}: failed${p.error ? ` — ${p.error}` : ""}`, tone: "bad" };
    case "waiting_quota":
      return { text: `Free-tier quota reached. ${n} resumes automatically`, tone: "info" };
    default:
      return { text: `${n}: ${statusInfo(p.status).label}`, tone: "info" };
  }
}

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function PipelineMonitor({
  pool,
  frozen,
  focusId,
}: {
  pool: string;
  frozen: boolean;
  /** Limit the people list to one person (profile page). */
  focusId?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [feed, setFeed] = useState<FeedLine[]>(() => [
    { id: 0, at: "", text: frozen ? "This pool is frozen. Nothing to process." : "Watching the pipeline…", tone: "info" },
  ]);
  const [ticking, setTicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const seq = useRef(0);
  const pollInFlight = useRef(false);
  const tickInFlight = useRef(false);
  const nextTickAt = useRef(0);
  const prev = useRef<{ sig: string; people: Map<string, string>; done: number } | null>(null);
  const mounted = useRef(true);

  const push = useCallback((lines: Array<{ text: string; tone: FeedLine["tone"] }>) => {
    if (!lines.length) return;
    setFeed((f) => [...lines.map((l) => ({ ...l, id: ++seq.current, at: now() })).reverse(), ...f].slice(0, 60));
  }, []);

  const tickRef = useRef<() => Promise<void>>(async () => {});

  const poll = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    const res = await api<PoolStatus>(`/api/status?pool=${encodeURIComponent(pool)}`);
    pollInFlight.current = false;
    if (!mounted.current) return;
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    const s = res.data;
    setStatus(s);
    if (s.notice) setNotice(s.notice);

    const people = new Map(s.people.map((p) => [p.id, p.status]));
    const sig = JSON.stringify([s.people.map((p) => `${p.id}:${p.status}`), s.dates.done, s.dates.total]);
    const before = prev.current;
    if (before && before.sig !== sig) {
      const lines: Array<{ text: string; tone: FeedLine["tone"] }> = [];
      for (const p of s.people) if (before.people.get(p.id) !== p.status) lines.push(transitionLine(p));
      if (s.dates.done > before.done) {
        const k = s.dates.done - before.done;
        lines.push({ text: `${k === 1 ? "A date" : `${k} dates`} just finished (${s.dates.done} of ${s.dates.total} done)`, tone: "good" });
      }
      push(lines);
      router.refresh();
    }
    prev.current = { sig, people, done: s.dates.done };

    if (s.pendingWork && !frozen && !tickInFlight.current && Date.now() >= nextTickAt.current) {
      void tickRef.current();
    }
  }, [pool, frozen, push, router]);

  const tick = useCallback(async () => {
    if (tickInFlight.current) return;
    tickInFlight.current = true;
    setTicking(true);
    const res = await api<TickResponse>(`/api/pipeline/tick?pool=${encodeURIComponent(pool)}`, { method: "POST" });
    tickInFlight.current = false;
    if (!mounted.current) return;
    setTicking(false);
    if (!res.ok) {
      setError(res.error);
      push([{ text: `The pipeline paused: ${res.error}`, tone: "bad" }]);
      nextTickAt.current = Date.now() + (res.status === 429 ? 20000 : 8000);
      return;
    }
    const d = res.data;
    if (d.notice !== undefined) setNotice(d.notice);
    push((d.log ?? []).map((text) => ({ text, tone: "info" as const })));
    // Waiting on something external (scrapers, quota): give it a moment before asking again.
    nextTickAt.current = Date.now() + (d.progressed > 0 ? 0 : 4000);
    void poll();
  }, [pool, poll, push]);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    mounted.current = true;
    const first = setTimeout(() => void poll(), 0);
    const t = setInterval(() => void poll(), 2500);
    return () => {
      mounted.current = false;
      clearTimeout(first);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(p: P, action: "retry" | "confirm") {
    setRowBusy((b) => ({ ...b, [p.id]: action }));
    setRowError((e) => ({ ...e, [p.id]: "" }));
    const res = await api<{ ok: true }>(`/api/people/${encodeURIComponent(p.id)}/${action}`, { method: "POST" });
    setRowBusy((b) => ({ ...b, [p.id]: "" }));
    if (!res.ok) {
      setRowError((e) => ({ ...e, [p.id]: res.error }));
      return;
    }
    push([
      {
        text:
          action === "retry"
            ? `Retrying ${firstName(p.displayName)} from where it stopped`
            : `Confirmed: ${possessive(p.displayName)} two links are the same person`,
        tone: "good",
      },
    ]);
    nextTickAt.current = 0;
    void poll();
    router.refresh();
  }

  const people = status?.people ?? [];
  const scoped = focusId ? people.filter((p) => p.id === focusId) : people;
  const active = scoped.filter((p) => p.status !== "ranked" && !(p.status === "profiled" && !focusId));
  const counted = people.filter((p) => !["rejected_private", "rejected_invalid"].includes(p.status));
  const readyN = counted.filter((p) => isReady(p.status)).length;
  const pct = counted.length ? Math.round((readyN / counted.length) * 100) : 0;
  const working = Boolean(status?.pendingWork) || ticking;

  return (
    <section
      data-testid="pipeline-monitor"
      aria-label="Live pipeline"
      className="overflow-hidden rounded-[24px] border border-line bg-ink-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-2.5" aria-hidden>
            {working && <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose opacity-60" />}
            <span className={`relative inline-flex size-2.5 rounded-full ${working ? "bg-rose" : "bg-mint"}`} />
          </span>
          <h2 className="font-semibold">
            {working ? "The agents are working" : status ? "All caught up" : "Connecting to the pipeline…"}
          </h2>
        </div>
        {status && (
          <p className="text-sm text-mute">
            {`${readyN} of ${counted.length} profiles ready, ${status.dates.done} of ${status.dates.total} dates done`}
          </p>
        )}
        <div className="h-1 w-full overflow-hidden rounded-full bg-line/70" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-rose to-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(notice || error) && (
        <div className="space-y-2 border-b border-line px-5 py-3 text-sm" aria-live="polite">
          {notice && <p className="text-gold">{notice}</p>}
          {error && <p className="text-alarm">{error}</p>}
        </div>
      )}

      <div className="grid md:grid-cols-[1.1fr_0.9fr]">
        <div className="border-line p-5 md:border-r">
          <h3 className="text-sm font-medium text-mute">{focusId ? "This person" : "In progress and needing attention"}</h3>
          {status && active.length === 0 && (
            <p className="mt-3 text-sm text-mute">
              {people.length === 0
                ? "No one here yet. Add people from the start page."
                : "Everyone in the pool has a profile. Open a profile, or send the agents on another round of dates."}
            </p>
          )}
          <ul className="mt-3 space-y-3">
            {active.map((p) => {
              const info = statusInfo(p.status);
              return (
                <li key={p.id} className="flex items-start gap-3">
                  <Avatar name={p.displayName} src={p.photoDataUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/pool/${pool}/p/${p.slug}`} className="truncate font-medium hover:underline">
                        {p.displayName}
                      </Link>
                      <StatusChip status={p.status} />
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-mute">
                      {p.statusDetail || info.description}
                      {p.error && p.status !== "rejected_private" ? ` ${p.error}` : ""}
                    </p>
                    {!frozen && p.status === "identity_mismatch" && (
                      <button
                        type="button"
                        onClick={() => act(p, "confirm")}
                        disabled={Boolean(rowBusy[p.id])}
                        className="mt-2 rounded-full border border-gold/60 px-3 py-1 text-xs font-semibold text-gold hover:bg-gold hover:text-ink disabled:opacity-50"
                      >
                        {rowBusy[p.id] ? "Confirming…" : "Confirm same person"}
                      </button>
                    )}
                    {!frozen && p.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => act(p, "retry")}
                        disabled={Boolean(rowBusy[p.id])}
                        className="mt-2 rounded-full border border-rose/60 px-3 py-1 text-xs font-semibold text-rose hover:bg-rose hover:text-ink disabled:opacity-50"
                      >
                        {rowBusy[p.id] ? "Retrying…" : "Retry"}
                      </button>
                    )}
                    {rowError[p.id] && <p className="mt-1 text-xs text-alarm">{rowError[p.id]}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t border-line p-5 md:border-t-0">
          <h3 className="text-sm font-medium text-mute">Activity</h3>
          <ol aria-live="polite" className="scroll-quiet mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
            {feed.map((l) => (
              <li key={l.id} className="flex gap-3 motion-safe:animate-rise">
                <span className="shrink-0 pt-px text-xs tabular-nums text-faint">{l.at}</span>
                <span className={l.tone === "good" ? "text-mint" : l.tone === "bad" ? "text-alarm" : "text-cream"}>
                  {l.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
