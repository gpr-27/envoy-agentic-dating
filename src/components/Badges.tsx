import type { ReactNode } from "react";
import { CONFIDENCE_LABEL, statusInfo, type Tone } from "@/lib/ui/format";
import { HeartIcon } from "./Icons";

const TONE: Record<Tone, string> = {
  work: "text-rose border-rose/40 bg-rose/10",
  ready: "text-mint border-mint/40 bg-mint/10",
  done: "text-gold border-gold/40 bg-gold/10",
  warn: "text-gold border-gold/50 bg-gold/5",
  error: "text-alarm border-alarm/50 bg-alarm/10",
  idle: "text-mute border-line bg-ink-3/60",
};

export function StatusChip({ status, className = "" }: { status: string; className?: string }) {
  const info = statusInfo(status);
  return (
    <span
      data-testid="status-chip"
      data-status={status}
      title={info.description}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[info.tone]} ${className}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full bg-current ${info.tone === "work" ? "animate-breathe" : ""}`}
      />
      {info.label}
    </span>
  );
}

export function Pill({
  children,
  tone = "idle",
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ConfidenceBadge({ level, className = "" }: { level: "high" | "medium" | "low"; className?: string }) {
  const dots = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-mute ${className}`}
      title={CONFIDENCE_LABEL[level]}
    >
      <span aria-hidden className="inline-flex items-end gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-[3px] rounded-sm ${i < dots ? "bg-gold" : "bg-line"}`} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      {CONFIDENCE_LABEL[level]}
    </span>
  );
}

/** Wax-seal style badge for mutual matches. */
export function MutualSeal({ size = "md" }: { size?: "sm" | "md" }) {
  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose px-2 py-0.5 text-xs font-semibold text-ink whitespace-nowrap">
        <HeartIcon size={11} /> It&apos;s mutual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose px-3 py-1 text-sm font-semibold text-ink shadow-[0_0_0_3px_var(--color-ink),0_0_0_4px_var(--color-rose)] whitespace-nowrap">
      <HeartIcon size={14} /> It&apos;s mutual
    </span>
  );
}

/** Tooltip that works on hover and keyboard focus, no JS. */
export function Tip({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      <span tabIndex={0} className="inline-flex cursor-help rounded-full">
        {children}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-72 max-w-[80vw] rounded-lg border border-line bg-ink-3 p-3 text-left text-xs leading-relaxed text-cream opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

export function IdentityBadge({ samePerson, reasons }: { samePerson: "likely" | "unsure" | "unlikely"; reasons: string[] }) {
  const map = {
    likely: { text: "Same person: likely", tone: "ready" as Tone },
    unsure: { text: "Same person: unsure", tone: "warn" as Tone },
    unlikely: { text: "Same person: unlikely", tone: "error" as Tone },
  }[samePerson];
  return (
    <Tip
      label={
        <>
          <span className="mb-1 block font-semibold">Identity check across both links</span>
          {reasons.length ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            "No specific reasons recorded."
          )}
        </>
      }
    >
      <Pill tone={map.tone}>{map.text}</Pill>
    </Tip>
  );
}

export function ScoreBar({ score, tone = "rose", label }: { score: number; tone?: "rose" | "gold" | "mute"; label?: string }) {
  const color = tone === "rose" ? "bg-rose" : tone === "gold" ? "bg-gold" : "bg-faint";
  return (
    <span className="flex items-center gap-2" aria-label={label ?? `Score ${Math.round(score)} out of 100`}>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </span>
      <span className="w-8 text-right text-sm font-semibold tabular-nums">{Math.round(score)}</span>
    </span>
  );
}
