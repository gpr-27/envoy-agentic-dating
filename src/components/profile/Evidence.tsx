"use client";

import { useRef } from "react";
import type { Evidence } from "@/lib/contracts";
import { evidenceTarget } from "@/lib/ui/format";
import { ExternalIcon, SourceIcon } from "../Icons";

export interface SourceCtx {
  experience: Array<{ title: string; company: string }>;
  posts: number;
}

function el(id: string | null) {
  return id ? document.getElementById(id) : null;
}

/** Highlight the source item an evidence ref points at. */
export function useSourceHighlight(ev: Evidence, ctx: SourceCtx | null) {
  const target = ctx ? evidenceTarget(ev.source, ev.ref, ctx) : null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on = () => el(target)?.classList.add("is-highlighted");
  const off = () => {
    if (!timer.current) el(target)?.classList.remove("is-highlighted");
  };
  const reveal = () => {
    const node = el(target);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.classList.add("is-highlighted");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      node.classList.remove("is-highlighted");
      timer.current = null;
    }, 2400);
  };
  return { target, on, off, reveal };
}

export function EvidenceChip({ ev, ctx }: { ev: Evidence; ctx: SourceCtx | null }) {
  const { target, on, off, reveal } = useSourceHighlight(ev, ctx);
  const tone = ev.source === "linkedin" ? "text-[#9cc6ee] border-[#9cc6ee]/35" : "text-rose border-rose/35";
  return (
    <button
      type="button"
      data-testid="evidence-chip"
      data-target={target ?? undefined}
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      onClick={reveal}
      title={ev.quote ? `“${ev.quote}”` : ev.ref}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border bg-ink/50 px-2.5 py-1 text-xs transition hover:bg-ink-3 ${tone}`}
    >
      <SourceIcon source={ev.source} size={12} />
      <span className="truncate">{ev.ref}</span>
      {ev.quote && <span className="hidden max-w-48 truncate text-mute sm:inline">“{ev.quote}”</span>}
    </button>
  );
}

/** One line in an evidence popover: source, ref, quote, link, "show in sources". */
export function EvidenceRow({ ev, ctx }: { ev: Evidence; ctx: SourceCtx | null }) {
  const { target, on, off, reveal } = useSourceHighlight(ev, ctx);
  return (
    <li className="flex gap-3 py-2.5" onMouseEnter={on} onMouseLeave={off}>
      <span className={`mt-0.5 ${ev.source === "linkedin" ? "text-[#9cc6ee]" : "text-rose"}`}>
        <SourceIcon source={ev.source} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-mute">
          {ev.source === "linkedin" ? "LinkedIn" : "Instagram"}, {ev.ref}
        </p>
        {ev.quote && <p className="mt-0.5 font-display text-[15px] italic leading-snug">“{ev.quote}”</p>}
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
          {target && ctx && (
            <button
              type="button"
              data-testid="evidence-chip"
              onClick={reveal}
              className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Show in sources
            </button>
          )}
          {ev.url && (
            <a
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-mute underline decoration-line underline-offset-2 hover:text-cream"
            >
              Open on {ev.source === "linkedin" ? "LinkedIn" : "Instagram"} <ExternalIcon size={11} />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
