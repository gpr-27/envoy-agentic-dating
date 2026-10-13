"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/ui/api";

/**
 * Headless pipeline driver for pages that show work in progress without the
 * full monitor (e.g. a date happening now): keeps one tick in flight at a time
 * and refreshes the page every few seconds.
 */
export function PipelineTicker({ pool, ms = 3000 }: { pool: string; ms?: number }) {
  const router = useRouter();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      const s = await api<{ pendingWork: boolean }>(`/api/status?pool=${encodeURIComponent(pool)}`);
      if (s.ok && s.data.pendingWork) {
        const t = await api(`/api/pipeline/tick?pool=${encodeURIComponent(pool)}`, { method: "POST" });
        if (alive) setError(t.ok ? null : t.error);
      } else if (!s.ok && alive) setError(s.error);
      busy.current = false;
      if (alive) router.refresh();
    };
    void run();
    const t = setInterval(() => void run(), ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pool, ms, router]);

  return error ? (
    <p role="status" className="mx-auto mt-3 max-w-4xl text-sm text-alarm">
      {error}
    </p>
  ) : null;
}
