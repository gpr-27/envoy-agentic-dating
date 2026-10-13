"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/ui/api";

export function RemovePerson({ id, pool, name }: { id: string; pool: string; name: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);

  // Drop back to the first step if the user walks away.
  useEffect(() => {
    if (step !== "confirm") return;
    const t = setTimeout(() => setStep("idle"), 8000);
    return () => clearTimeout(t);
  }, [step]);

  async function remove() {
    setStep("busy");
    setError(null);
    const res = await api<{ ok: true }>(`/api/people/${encodeURIComponent(id)}?pool=${encodeURIComponent(pool)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setStep("idle");
      setError(res.error);
      return;
    }
    router.push(`/pool/${pool}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {step === "idle" && (
          <button
            type="button"
            data-testid="remove-person"
            onClick={() => setStep("confirm")}
            className="rounded-full border border-alarm/50 px-4 py-2 text-sm text-alarm transition hover:bg-alarm/10"
          >
            Remove this person
          </button>
        )}
        {step !== "idle" && (
          <>
            <button
              type="button"
              data-testid="remove-person"
              data-confirm="true"
              onClick={remove}
              disabled={step === "busy"}
              autoFocus
              className="rounded-full bg-alarm px-4 py-2 text-sm font-semibold text-ink transition hover:bg-cream disabled:opacity-60"
            >
              {step === "busy" ? "Removing…" : `Yes, remove ${name}`}
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              disabled={step === "busy"}
              className="rounded-full border border-line px-4 py-2 text-sm text-mute hover:border-cream hover:text-cream"
            >
              Keep
            </button>
          </>
        )}
      </div>
      {step === "confirm" && (
        <p className="text-xs text-mute">Their profile, dates and ranking entries disappear from this pool.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-alarm">
          {error}
        </p>
      )}
    </div>
  );
}
