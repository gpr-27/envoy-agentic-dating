"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/ui/hooks";
import type { ReadingLog as Log } from "@/lib/contracts";
import { PauseIcon, PlayIcon, SourceIcon } from "../Icons";
import { EvidenceChip, type SourceCtx } from "./Evidence";

const SOURCE_NAME = { linkedin: "LinkedIn", instagram: "Instagram", both: "Both profiles" } as const;

export function ReadingLogReplay({ log, name, ctx }: { log: Log; name: string; ctx: SourceCtx | null }) {
  const steps = log.steps;
  const total = steps.length + 1; // + first impression
  const reduced = useReducedMotion();
  const [rawCur, setCur] = useState(0);
  const [chars, setChars] = useState(0);
  const [rawPlaying, setPlaying] = useState(false);
  const cur = reduced ? total : rawCur;
  const playing = rawPlaying && cur < total;
  const started = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  // Autoplay once the log scrolls into view.
  useEffect(() => {
    if (reduced) return;
    const node = root.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started.current) {
          started.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const text = cur < steps.length ? steps[cur].observation : log.firstImpression;
    const t =
      chars < text.length
        ? setTimeout(() => setChars((c) => Math.min(text.length, c + 2)), 16)
        : setTimeout(() => {
            setCur((c) => c + 1);
            setChars(0);
          }, 700);
    return () => clearTimeout(t);
  }, [playing, cur, chars, total, steps, log.firstImpression]);

  const done = cur >= total;

  function toggle() {
    started.current = true;
    if (done) {
      setCur(0);
      setChars(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }

  return (
    <div ref={root} data-testid="reading-log" className="rounded-[24px] border border-line bg-ink-2/70">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="text-sm text-mute">
          {done ? `Read ${steps.length} things, then wrote the profile` : `Step ${Math.min(cur + 1, steps.length)} of ${steps.length}`}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-rose"
          >
            {playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
            {playing ? "Pause" : done ? "Replay the reading" : cur === 0 && chars === 0 ? "Play" : "Resume"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => {
                started.current = true;
                setPlaying(false);
                setCur(total);
              }}
              className="rounded-full border border-line px-3.5 py-1.5 text-xs text-mute hover:border-cream hover:text-cream"
            >
              Skip to the end
            </button>
          )}
        </div>
      </div>

      <ol className="relative px-5 py-5">
        <span aria-hidden className="absolute bottom-8 left-[2.15rem] top-8 w-px bg-line" />
        {steps.map((s, i) => {
          const state = i < cur ? "done" : i === cur ? "active" : "pending";
          const text = state === "done" ? s.observation : state === "active" ? s.observation.slice(0, chars) : "";
          return (
            <li key={i} className={`relative flex gap-4 pb-5 transition-opacity ${state === "pending" ? "opacity-35" : ""}`}>
              <span
                className={`relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border ${
                  state === "active"
                    ? "border-rose bg-rose text-ink"
                    : s.source === "linkedin"
                      ? "border-line bg-ink-3 text-[#9cc6ee]"
                      : s.source === "instagram"
                        ? "border-line bg-ink-3 text-rose"
                        : "border-line bg-ink-3 text-gold"
                }`}
                title={SOURCE_NAME[s.source]}
              >
                <SourceIcon source={s.source} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {s.looked_at}
                  <span className="ml-2 font-normal text-faint">{SOURCE_NAME[s.source]}</span>
                </p>
                {state !== "pending" && (
                  <p className="mt-1 text-[15px] leading-relaxed text-cream/90">
                    {text}
                    {state === "active" && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-rose" />}
                  </p>
                )}
                {state === "done" && s.evidence.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 motion-safe:animate-rise">
                    {s.evidence.map((ev, j) => (
                      <EvidenceChip key={j} ev={ev} ctx={ctx} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        <li className={`relative flex gap-4 transition-opacity ${cur < steps.length ? "opacity-35" : ""}`}>
          <span className="relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/60 bg-gold/15 font-display text-gold">
            ✶
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">First impression of {name}</p>
            {cur >= steps.length && (
              <p className="mt-1 font-display text-lg italic leading-relaxed">
                {cur > steps.length ? log.firstImpression : log.firstImpression.slice(0, chars)}
                {cur === steps.length && <span className="ml-0.5 inline-block h-4 w-[2px] animate-blink bg-gold" />}
              </p>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
