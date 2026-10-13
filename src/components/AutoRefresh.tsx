"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetch the server component tree every `ms` while mounted. */
export function AutoRefresh({ ms = 3000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, ms);
    return () => clearInterval(t);
  }, [router, ms]);
  return null;
}
