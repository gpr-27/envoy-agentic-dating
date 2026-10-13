"use client";

import { useId, useState } from "react";
import type { Trait } from "@/lib/contracts";
import { CONFIDENCE_LABEL } from "@/lib/ui/format";
import { SourceIcon } from "../Icons";
import { EvidenceRow, type SourceCtx } from "./Evidence";

function Dots({ level }: { level: Trait["confidence"] }) {
  const n = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-end gap-[3px] pt-1" title={CONFIDENCE_LABEL[level]} role="img" aria-label={CONFIDENCE_LABEL[level]}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`w-[3px] rounded-sm ${i < n ? "bg-gold" : "bg-line"}`} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

export function TraitItem({ trait, ctx, accent = "rose" }: { trait: Trait; ctx: SourceCtx | null; accent?: "rose" | "gold" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const sources = Array.from(new Set(trait.evidence.map((e) => e.source)));
  return (
    <li className={`rounded-2xl border bg-ink-2/60 p-4 transition-colors ${open ? "border-gold/50" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`font-display text-xl leading-tight ${accent === "gold" ? "text-gold" : "text-cream"}`}>{trait.label}</p>
        <Dots level={trait.confidence} />
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-mute">{trait.detail}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-mute transition hover:border-cream hover:text-cream"
      >
        <span className="inline-flex gap-1">
          {sources.map((s) => (
            <SourceIcon key={s} source={s} size={11} />
          ))}
        </span>
        {open ? "Hide the evidence" : `Evidence (${trait.evidence.length})`}
      </button>
      {open && (
        <ul
          id={id}
          data-testid="evidence-popover"
          className="mt-2 divide-y divide-line/60 rounded-xl border border-line bg-ink/60 px-3 motion-safe:animate-rise"
        >
          {trait.evidence.map((ev, i) => (
            <EvidenceRow key={i} ev={ev} ctx={ctx} />
          ))}
        </ul>
      )}
    </li>
  );
}
