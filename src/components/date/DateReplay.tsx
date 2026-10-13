"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DateRecord, Debrief, Turn } from "@/lib/contracts";
import type { PersonCard } from "@/lib/views";
import { firstName, possessive } from "@/lib/ui/format";
import { useReducedMotion } from "@/lib/ui/hooks";
import { Avatar } from "../Avatar";
import { HeartIcon, PauseIcon, PlayIcon } from "../Icons";

type Side = "a" | "b";
const SPEEDS = [1, 2, 4] as const;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg width="64" height="20" aria-hidden />;
  const w = 64;
  const h = 20;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 10) * (h - 2) - 1}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AgentHeader({ side, card, vibes, align }: { side: Side; card: PersonCard; vibes: number[]; align: "left" | "right" }) {
  const vibe = vibes.length ? vibes[vibes.length - 1] : null;
  const color = side === "a" ? "var(--color-rose)" : "var(--color-gold)";
  return (
    <div className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <Avatar name={card.displayName} src={card.photoDataUrl} size={44} ring={side === "a" ? "rose" : "gold"} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold sm:text-base">{possessive(card.displayName)} agent</p>
        <div className={`mt-1 flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <div
            className="relative h-1.5 w-full max-w-36 overflow-hidden rounded-full bg-line/70"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={vibe ?? 0}
            aria-label={`${possessive(card.displayName)} agent's read of the vibe`}
          >
            <span
              className={`absolute inset-y-0 rounded-full transition-[width] duration-700 ${align === "right" ? "right-0" : "left-0"}`}
              style={{ width: `${((vibe ?? 0) / 10) * 100}%`, background: color }}
            />
          </div>
          <span className="w-10 shrink-0 text-sm font-semibold tabular-nums" style={{ color }}>
            {vibe == null ? "—" : `${vibe}/10`}
          </span>
          <span className="hidden sm:inline">
            <Sparkline values={vibes} color={color} />
          </span>
        </div>
        <p className="mt-0.5 text-xs text-faint">Vibe meter</p>
      </div>
    </div>
  );
}

function Bubble({
  turn,
  text,
  card,
  showThought,
  typing,
}: {
  turn: Turn;
  text: string;
  card: PersonCard;
  showThought: boolean;
  typing?: boolean;
}) {
  const isA = turn.speaker === "a";
  return (
    <li data-testid="date-turn" data-speaker={turn.speaker} className={`flex ${isA ? "justify-start" : "justify-end"}`}>
      <div className={`flex max-w-[min(36rem,88%)] items-end gap-2.5 ${isA ? "" : "flex-row-reverse"}`}>
        <Avatar name={card.displayName} src={card.photoDataUrl} size={30} className="mb-1 hidden sm:inline-flex" />
        <div className={isA ? "" : "text-right"}>
          <div
            className={`inline-block rounded-[20px] px-4 py-3 text-left text-[15.5px] leading-relaxed ${
              isA ? "rounded-bl-md bg-rose/15 ring-1 ring-rose/25" : "rounded-br-md bg-gold/12 ring-1 ring-gold/25"
            }`}
          >
            <span className={`mb-0.5 block text-[11px] font-medium ${isA ? "text-rose" : "text-gold"}`}>
              {possessive(card.displayName)} agent
            </span>
            {text}
            {typing && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-cream" />}
          </div>
          {showThought && turn.thought && !typing && (
            <p
              className={`mt-1.5 max-w-md font-display text-sm italic leading-snug text-mute motion-safe:animate-rise ${isA ? "" : "ml-auto"}`}
            >
              <span className="not-italic font-sans text-[11px] text-faint">Private thought </span>
              {turn.thought}
              <span className="ml-1.5 not-italic font-sans text-[11px] tabular-nums text-faint">vibe {turn.vibe}/10</span>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function TypingBubble({ side, card }: { side: Side; card: PersonCard }) {
  return (
    <li className={`flex ${side === "a" ? "justify-start" : "justify-end"}`} aria-label={`${possessive(card.displayName)} agent is typing`}>
      <div
        className={`flex items-center gap-1 rounded-[20px] px-4 py-3.5 ${
          side === "a" ? "rounded-bl-md bg-rose/15 text-rose" : "rounded-br-md bg-gold/12 text-gold"
        }`}
      >
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </li>
  );
}

function DebriefCard({ testid, side, card, partner, d }: { testid: string; side: Side; card: PersonCard; partner: PersonCard; d: Debrief | null }) {
  const color = side === "a" ? "text-rose" : "text-gold";
  return (
    <section
      data-testid={testid}
      className={`rounded-[24px] border bg-ink-2 p-6 motion-safe:animate-rise ${side === "a" ? "border-rose/40" : "border-gold/40"}`}
      aria-label={`${possessive(card.displayName)} agent's private debrief`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={card.displayName} src={card.photoDataUrl} size={40} ring={side === "a" ? "rose" : "gold"} />
        <div>
          <p className="font-semibold">{possessive(card.displayName)} agent</p>
          <p className="text-xs text-faint">Private debrief for {firstName(card.displayName)}, about {firstName(partner.displayName)}</p>
        </div>
      </div>
      {!d ? (
        <p className="mt-6 text-mute">This debrief hasn&apos;t been written yet.</p>
      ) : (
        <>
          <div className="mt-6 flex items-end gap-4">
            <p className={`text-7xl font-semibold tracking-tighter leading-none tabular-nums ${color}`}>
              {d.chemistry}
              <span className="text-3xl font-normal tracking-normal text-faint">/10</span>
            </p>
            <p className="pb-2 text-sm text-mute">chemistry</p>
          </div>
          <p className="mt-4 font-display text-xl italic leading-snug">“{d.verdict}”</p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold">What clicked</h4>
              <ul className="mt-2 space-y-1 text-sm text-cream/90">
                {d.clicked.length ? d.clicked.map((c, i) => <li key={i}>{c}</li>) : <li className="text-faint">Nothing noted</li>}
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold">Concerns</h4>
              <ul className="mt-2 space-y-1 text-sm text-cream/90">
                {d.concerns.length ? d.concerns.map((c, i) => <li key={i}>{c}</li>) : <li className="text-faint">None</li>}
              </ul>
            </div>
          </div>
          <div className={`mt-5 rounded-2xl p-4 ${d.secondDate ? "bg-mint/10" : "bg-alarm/10"}`}>
            <p className={`font-semibold ${d.secondDate ? "text-mint" : "text-alarm"}`}>
              Second date? {d.secondDate ? "Yes" : "No"}
            </p>
            <p className="mt-1 text-sm text-cream/90">{d.reason}</p>
          </div>
        </>
      )}
    </section>
  );
}

export function DateReplay({
  date,
  a,
  b,
  acts,
  pool,
}: {
  date: DateRecord;
  a: PersonCard;
  b: PersonCard;
  acts: ReadonlyArray<{ act: number; title: string }>;
  pool: string;
}) {
  const turns = date.transcript;
  const live = date.status === "planned" || date.status === "in_progress" || date.status === "debriefing";
  const reduced = useReducedMotion();
  const [rawShown, setShown] = useState(live ? turns.length : 0);
  // A date watched while it was happening keeps showing everything once it finishes.
  const [pinAll, setPinAll] = useState(live);
  const shown = live || reduced || pinAll ? turns.length : rawShown;
  const [phase, setPhase] = useState<"indicator" | "typing">("indicator");
  const [chars, setChars] = useState(0);
  const [rawPlaying, setPlaying] = useState(false);
  const playing = rawPlaying && shown < turns.length;
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [thoughts, setThoughts] = useState(false);
  const follow = useRef(true);
  const cursor = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);

  // Autoplay finished dates.
  useEffect(() => {
    if (live || reduced) return;
    const t = setTimeout(() => setPlaying(true), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing || live) return;
    const text = turns[shown].text;
    let t: ReturnType<typeof setTimeout>;
    if (phase === "indicator") {
      t = setTimeout(() => {
        setPhase("typing");
        setChars(0);
      }, 900 / speed);
    } else if (chars < text.length) {
      t = setTimeout(() => setChars((c) => Math.min(text.length, c + 2)), 22 / speed);
    } else {
      t = setTimeout(() => {
        setShown((s) => s + 1);
        setPhase("indicator");
        setChars(0);
      }, 650 / speed);
    }
    return () => clearTimeout(t);
  }, [playing, live, shown, phase, chars, speed, turns]);

  // Keep the newest line in view while playing, unless the reader scrolled away.
  useEffect(() => {
    // Scrolling back up means the reader wants to look at something: stop following.
    const wheel = (e: WheelEvent) => {
      if (e.deltaY < 0) follow.current = false;
    };
    const keys = (e: KeyboardEvent) => {
      if (["ArrowUp", "PageUp", "Home"].includes(e.key)) follow.current = false;
    };
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keys);
    };
  }, []);
  useEffect(() => {
    if (!playing || !follow.current) return;
    // Only follow once the reader has scrolled down to the conversation.
    const top = list.current?.getBoundingClientRect().top ?? 0;
    if (top > window.innerHeight * 0.5) return;
    cursor.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [shown, phase, playing, reduced]);

  const play = useCallback(() => {
    follow.current = true;
    setPinAll(false);
    if (shown >= turns.length) {
      setShown(0);
      setPhase("indicator");
      setChars(0);
    }
    setPlaying(true);
  }, [shown, turns.length]);

  const finished = shown >= turns.length;
  const typingTurn = !finished && playing && phase === "typing" ? turns[shown] : null;
  const revealed = turns.slice(0, shown);
  const vibesOf = (s: Side) => [...revealed, ...(typingTurn ? [typingTurn] : [])].filter((t) => t.speaker === s).map((t) => t.vibe);
  const cardOf = (s: Side) => (s === "a" ? a : b);
  const mutual = Boolean(date.debriefA?.secondDate && date.debriefB?.secondDate);
  const nextSpeaker: Side | null = !finished && playing && phase === "indicator" ? turns[shown].speaker : null;
  const liveNext: Side | null =
    live && date.status === "in_progress" ? (turns.length ? (turns[turns.length - 1].speaker === "a" ? "b" : "a") : "a") : null;

  // Render with act headers.
  const rows: React.ReactNode[] = [];
  let lastAct = 0;
  const visible = typingTurn ? [...revealed, typingTurn] : revealed;
  visible.forEach((t, i) => {
    if (t.act !== lastAct) {
      lastAct = t.act;
      const act = acts.find((x) => x.act === t.act);
      rows.push(
        <li key={`act-${t.act}`} className="flex items-center gap-4 pb-1 pt-6 first:pt-0">
          <span className="h-px flex-1 bg-line" />
          <span className="font-display text-lg italic text-cream/90">
            Act {t.act}
            {act ? `, ${act.title.charAt(0).toLowerCase()}${act.title.slice(1)}` : ""}
          </span>
          <span className="h-px flex-1 bg-line" />
        </li>,
      );
    }
    const isTyping = typingTurn != null && i === visible.length - 1;
    rows.push(
      <Bubble
        key={t.idx}
        turn={t}
        text={isTyping ? t.text.slice(0, chars) : t.text}
        card={cardOf(t.speaker)}
        showThought={thoughts}
        typing={isTyping}
      />,
    );
  });
  if (nextSpeaker) rows.push(<TypingBubble key="typing" side={nextSpeaker} card={cardOf(nextSpeaker)} />);
  if (liveNext) rows.push(<TypingBubble key="live-typing" side={liveNext} card={cardOf(liveNext)} />);

  return (
    <div>
      {/* Agents + vibe meters */}
      <div className="sticky top-[57px] z-20 -mx-5 border-y border-line/70 bg-ink/90 px-5 py-3 backdrop-blur-md max-sm:static">
        <div className="mx-auto grid max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-3">
          <AgentHeader side="a" card={a} vibes={vibesOf("a")} align="left" />
          <HeartIcon size={18} className={mutual && finished ? "text-rose" : "text-line"} />
          <AgentHeader side="b" card={b} vibes={vibesOf("b")} align="right" />
        </div>
      </div>

      {/* Controls */}
      {!live && (
        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (playing ? setPlaying(false) : play())}
            className="inline-flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-sm font-semibold text-ink hover:bg-rose"
          >
            {playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
            {playing ? "Pause" : finished ? "Replay the date" : shown === 0 && phase === "indicator" ? "Play" : "Resume"}
          </button>
          <div role="group" aria-label="Playback speed" className="inline-flex rounded-full border border-line p-0.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                onClick={() => setSpeed(s)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums ${speed === s ? "bg-ink-3 text-cream" : "text-mute hover:text-cream"}`}
              >
                {s}x
              </button>
            ))}
          </div>
          {!finished && (
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setShown(turns.length);
              }}
              className="rounded-full border border-line px-4 py-2 text-sm text-mute hover:border-cream hover:text-cream"
            >
              Show everything
            </button>
          )}
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2.5 text-sm text-mute">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={thoughts}
              onChange={(e) => setThoughts(e.target.checked)}
            />
            <span
              aria-hidden
              className="relative h-5 w-9 rounded-full bg-line transition peer-checked:bg-rose peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-cream after:transition peer-checked:after:translate-x-4"
            />
            Show agents&apos; private thoughts
          </label>
        </div>
      )}
      {live && (
        <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm">
          <p>
            <span className="font-semibold text-rose">This date is happening now.</span>{" "}
            <span className="text-cream/90">New lines appear as each agent takes its turn.</span>
          </p>
          <label className="inline-flex items-center gap-2 text-mute">
            <input type="checkbox" checked={thoughts} onChange={(e) => setThoughts(e.target.checked)} className="accent-rose" />
            Show private thoughts
          </label>
        </div>
      )}

      {/* Transcript */}
      <ol ref={list} className="mx-auto mt-6 max-w-4xl space-y-4" aria-live={playing ? "off" : "polite"}>
        {rows}
        {turns.length === 0 && (
          <li className="rounded-2xl border border-dashed border-line p-6 text-center text-mute">
            The agents are still choosing where to go. The first lines appear here in a moment.
          </li>
        )}
      </ol>
      <div ref={cursor} className="h-24" aria-hidden />

      {/* Debriefs + verdict */}
      {finished && !live && (
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center font-display text-4xl">After the date</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-mute">
            Each agent writes a private debrief for its own person. Neither agent sees the other&apos;s.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <DebriefCard testid="debrief-a" side="a" card={a} partner={b} d={date.debriefA} />
            <DebriefCard testid="debrief-b" side="b" card={b} partner={a} d={date.debriefB} />
          </div>
          {date.debriefA && date.debriefB && (
            <div
              className={`mt-10 rounded-[28px] border p-8 text-center motion-safe:animate-rise ${
                mutual ? "border-rose bg-rose/10" : "border-line bg-ink-2"
              }`}
            >
              {mutual ? (
                <>
                  <p className="inline-flex items-center gap-3 font-display text-5xl text-rose sm:text-6xl">
                    It&apos;s mutual <HeartIcon size={40} />
                  </p>
                  <p className="mt-3 text-cream/90">
                    Both agents want a second date for their person.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-5xl sm:text-6xl">Not a match</p>
                  <p className="mt-3 text-mute">
                    {!date.debriefA.secondDate && !date.debriefB.secondDate
                      ? "Neither agent asked for a second date."
                      : `${possessive((date.debriefA.secondDate ? b : a).displayName)} agent passed on a second date.`}
                  </p>
                </>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm">
                <Link href={`/pool/${pool}/p/${a.slug}#ranking`} className="rounded-full border border-line px-4 py-2 hover:border-rose">
                  {possessive(a.displayName)} ranking
                </Link>
                <Link href={`/pool/${pool}/p/${b.slug}#ranking`} className="rounded-full border border-line px-4 py-2 hover:border-gold">
                  {possessive(b.displayName)} ranking
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
