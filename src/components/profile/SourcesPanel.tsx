import type { SourceSummary } from "@/lib/views";
import { compactNumber } from "@/lib/ui/format";
import { ExternalIcon, InstagramIcon, LinkedInIcon, PinIcon } from "../Icons";

const item = "rounded-xl transition-[outline,box-shadow] scroll-mt-28";

export function SourcesPanel({ sources }: { sources: SourceSummary }) {
  const { linkedin: li, instagram: ig } = sources;
  return (
    <div className="space-y-4">
      {/* LinkedIn */}
      <article className="rounded-[22px] border border-line bg-ink-2/70 p-5" aria-label="LinkedIn as read by the agent">
        <header className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LinkedInIcon size={16} className="text-[#9cc6ee]" /> LinkedIn
          </p>
          <a
            href={li.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-mute hover:text-cream"
          >
            Open <ExternalIcon size={11} />
          </a>
        </header>
        <div id="src-li-headline" className={`${item} mt-3 p-1`}>
          <p className="font-medium">{li.fullName}</p>
          {li.headline && <p className="text-sm text-mute">{li.headline}</p>}
          {li.location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-faint">
              <PinIcon size={11} /> {li.location}
            </p>
          )}
        </div>
        {li.about && (
          <div id="src-li-about" className={`${item} mt-3 p-1`}>
            <p className="text-xs text-faint">About</p>
            <p className="mt-1 line-clamp-6 text-sm leading-relaxed text-cream/85">{li.about}</p>
          </div>
        )}
        {li.experience.length > 0 && (
          <div id="src-li-experience" className={`${item} mt-3 p-1`}>
            <p className="text-xs text-faint">Experience</p>
            <ul className="mt-1 space-y-1">
              {li.experience.map((e, i) => (
                <li key={i} id={`src-li-exp-${i}`} className={`${item} px-1 py-0.5 text-sm`}>
                  <span className="font-medium">{e.title}</span>
                  {e.company && <span className="text-mute"> at {e.company}</span>}
                  {e.dateRange && <span className="block text-xs text-faint">{e.dateRange}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {li.education.length > 0 && (
          <div id="src-li-education" className={`${item} mt-3 p-1`}>
            <p className="text-xs text-faint">Education</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {li.education.map((e, i) => (
                <li key={i}>
                  {e.school}
                  {e.degree && <span className="text-mute">, {e.degree}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {li.skills.length > 0 && (
          <div id="src-li-skills" className={`${item} mt-3 p-1`}>
            <p className="text-xs text-faint">Skills</p>
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {li.skills.map((s) => (
                <li key={s} className="rounded-full bg-ink-3 px-2 py-0.5 text-xs">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      {/* Instagram */}
      <article className="rounded-[22px] border border-line bg-ink-2/70 p-5" aria-label="Instagram as read by the agent">
        <header className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <InstagramIcon size={16} className="text-rose" /> @{ig.handle}
            {ig.isVerified && <span className="text-xs font-normal text-gold">verified</span>}
          </p>
          <a
            href={ig.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-mute hover:text-cream"
          >
            Open <ExternalIcon size={11} />
          </a>
        </header>
        <div id="src-ig-bio" className={`${item} mt-3 p-1`}>
          <p className="flex gap-4 text-sm">
            <span>
              <span className="font-semibold tabular-nums">{compactNumber(ig.followers)}</span>{" "}
              <span className="text-mute">followers</span>
            </span>
            <span>
              <span className="font-semibold tabular-nums">{compactNumber(ig.postsCount)}</span>{" "}
              <span className="text-mute">posts</span>
            </span>
          </p>
          {ig.biography && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-cream/85">{ig.biography}</p>}
        </div>
        {ig.posts.length > 0 && (
          <div id="src-ig-posts" className={`${item} mt-3 p-1`}>
            <p className="text-xs text-faint">Latest posts the agent read</p>
            <ul className="mt-2 grid grid-cols-3 gap-1.5">
              {ig.posts.map((p, i) => (
                <li key={p.id} id={`src-ig-post-${i + 1}`} className={`${item} relative aspect-square overflow-hidden bg-ink-3`}>
                  <a
                    href={p.url || ig.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={p.caption || `Post ${i + 1}`}
                    className="group block size-full"
                  >
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageDataUrl}
                        alt={p.caption ? p.caption.slice(0, 120) : `Instagram post ${i + 1}`}
                        width={160}
                        height={160}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full flex-col justify-between bg-gradient-to-br from-ink-3 to-ink p-2">
                        <span className="line-clamp-4 font-display text-[11.5px] italic leading-snug text-cream/85">
                          {p.caption || "No caption"}
                        </span>
                        {p.location && <span className="truncate text-[10px] text-faint">{p.location}</span>}
                      </span>
                    )}
                    <span className="absolute left-1 top-1 rounded-full bg-ink/80 px-1.5 text-[10px] tabular-nums text-cream">
                      {i + 1}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
