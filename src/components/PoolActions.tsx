"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/ui/api";

export function PoolActions({ pool, canDate }: { pool: string; canDate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "round" | "rank">(null);
  const [msg, setMsg] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  async function round() {
    setBusy("round");
    setMsg(null);
    const res = await api<{ created: number }>(`/api/pool/${pool}/round`, { method: "POST" });
    setBusy(null);
    if (!res.ok) return setMsg({ text: res.error, tone: "bad" });
    const n = res.data?.created ?? 0;
    setMsg(
      n > 0
        ? { text: `${n} new ${n === 1 ? "date is" : "dates are"} on the calendar. The agents head out now; watch the activity feed.`, tone: "good" }
        : { text: "No new pairs to send out. Every compatible pair has already been on a date.", tone: "good" },
    );
    router.refresh();
  }

  async function rank() {
    setBusy("rank");
    setMsg(null);
    const res = await api<{ ok: true }>(`/api/pool/${pool}/rankings`, { method: "POST" });
    setBusy(null);
    if (!res.ok) return setMsg({ text: res.error, tone: "bad" });
    setMsg({ text: "Rankings recomputed from every finished date.", tone: "good" });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="run-round"
          onClick={round}
          disabled={busy !== null || !canDate}
          title={canDate ? undefined : "Needs at least two people with a finished profile"}
          className="rounded-full bg-rose px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "round" ? "Planning dates…" : "Send the agents on another round of dates"}
        </button>
        <button
          type="button"
          data-testid="recompute-rankings"
          onClick={rank}
          disabled={busy !== null}
          className="rounded-full border border-gold/60 px-5 py-2.5 text-sm font-semibold text-gold transition hover:bg-gold hover:text-ink disabled:cursor-wait disabled:opacity-50"
        >
          {busy === "rank" ? "Recomputing…" : "Recompute rankings"}
        </button>
      </div>
      {!canDate && <p className="text-xs text-faint">Dates start once two people have a finished profile.</p>}
      {msg && (
        <p role="status" className={`max-w-md text-sm ${msg.tone === "bad" ? "text-alarm" : "text-mint"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
