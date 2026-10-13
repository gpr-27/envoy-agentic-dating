import { HeartIcon, InstagramIcon, LinkedInIcon } from "./Icons";

const STEPS = [
  { title: "The agent reads", body: "Reads both pages and analyzes the person, citing evidence for everything." },
  { title: "Profile page", body: "Needs, hobbies, interests and the other qualities it found." },
  { title: "The agents date", body: "Each agent goes on dates with other agents, on its person's behalf." },
  { title: "Ranking", body: "For every person: who fits them best, scored from both sides of each date." },
];

function Connector() {
  return (
    <span aria-hidden className="relative flex shrink-0 items-center justify-center max-lg:h-8 lg:w-10">
      <span className="absolute border-dashed border-rose/50 max-lg:inset-y-0 max-lg:left-1/2 max-lg:border-l lg:inset-x-0 lg:top-1/2 lg:border-t" />
      <span className="relative size-1.5 rounded-full bg-rose" />
    </span>
  );
}

/** The brief's flow: LinkedIn + Instagram -> agent -> profile -> dates -> ranking. */
export function FlowDiagram() {
  return (
    <ol className="flex flex-col items-stretch lg:flex-row" aria-label="How Envoy works, step by step">
      <li className="flex flex-col justify-center gap-2 lg:w-48">
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
          <LinkedInIcon size={20} className="text-[#7fb6ea]" />
          <div>
            <p className="font-medium">LinkedIn</p>
            <p className="text-xs text-mute">public profile</p>
          </div>
        </div>
        <span aria-hidden className="self-center font-display text-xl text-gold">
          +
        </span>
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3">
          <InstagramIcon size={20} className="text-rose" />
          <div>
            <p className="font-medium">Instagram</p>
            <p className="text-xs text-mute">public profile</p>
          </div>
        </div>
      </li>
      {STEPS.map((s, i) => (
        <li key={s.title} className="contents">
          <Connector />
          <div
            className={`flex-1 rounded-2xl border p-4 ${
              i === STEPS.length - 1 ? "border-gold/60 bg-gold/10" : "border-line bg-ink-2"
            }`}
          >
            <p className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-rose tabular-nums">{i + 1}</span>
              <span className="font-semibold">{s.title}</span>
              {i === 2 && <HeartIcon size={13} className="text-rose" />}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-mute">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
