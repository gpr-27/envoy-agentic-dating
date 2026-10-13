"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { api } from "@/lib/ui/api";
import { InstagramIcon, LinkedInIcon } from "./Icons";

interface LineError {
  line: number;
  input: string;
  code: string;
  message: string;
}
interface AddResponse {
  accepted: Array<{ id: string; slug: string; displayName: string }>;
  errors: LineError[];
}

/* Lightweight hints only. The server decides what's valid. */
function linkedinHint(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/lnkd\.in\//i.test(s)) return "Shortlinks don't work. Open it and copy the full linkedin.com/in/… address.";
  if (/linkedin\.com\/(company|school|showcase)\//i.test(s)) return "That's an organisation page. Use a person's profile (linkedin.com/in/…).";
  if (/linkedin\.com\/(pub|profile\/view)/i.test(s)) return "Old-style profile link. Open it and copy the linkedin.com/in/… address.";
  if (!/linkedin\.com\/in\/[^/\s?#]+/i.test(s)) return "Expected a profile link like linkedin.com/in/jane-doe";
  return null;
}
function instagramHint(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/instagram\.com\/(p|reel|reels|stories|tv|explore)\//i.test(s))
    return "That's a post or story link. Paste the profile link or the @handle.";
  if (/instagram\.com\//i.test(s)) {
    return /instagram\.com\/[A-Za-z0-9._]{1,30}\/?(\?.*)?$/i.test(s) ? null : "Expected instagram.com/handle";
  }
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(s)) return null;
  return "Expected an Instagram profile link or an @handle";
}

interface ParsedLine {
  line: number;
  raw: string;
  linkedin: string;
  instagram: string;
  hint: string | null;
}

function parseBulk(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t || t.startsWith("#")) return;
    // Skip a CSV header row.
    if (/linkedin/i.test(t) && /instagram/i.test(t) && !/linkedin\.com/i.test(t)) return;
    const parts = t.split(/[,\t;]|\s+/).map((p) => p.trim().replace(/^"|"$/g, "")).filter(Boolean);
    const li = parts.find((p) => /linkedin|lnkd/i.test(p)) ?? parts[0] ?? "";
    const ig = parts.find((p) => p !== li && (/instagram\.com/i.test(p) || p.startsWith("@"))) ?? parts.find((p) => p !== li) ?? "";
    let hint: string | null = null;
    if (!ig) hint = "Each line needs two links: LinkedIn, then Instagram.";
    else hint = linkedinHint(li) ?? instagramHint(ig);
    out.push({ line: i + 1, raw: t, linkedin: li, instagram: ig, hint });
  });
  return out;
}

const field =
  "w-full rounded-xl border border-line bg-ink/70 px-3.5 py-2.5 text-[15px] text-cream placeholder:text-faint/80 outline-none transition focus:border-rose focus:ring-2 focus:ring-rose/30";

export function AddPeople() {
  const router = useRouter();
  const id = useId();
  const [li, setLi] = useState("");
  const [ig, setIg] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [seeking, setSeeking] = useState("everyone");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState<null | "single" | "bulk">(null);
  const [error, setError] = useState<string | null>(null);
  const [lineErrors, setLineErrors] = useState<LineError[]>([]);
  const [accepted, setAccepted] = useState<AddResponse["accepted"]>([]);
  const [touched, setTouched] = useState({ li: false, ig: false });
  const fileRef = useRef<HTMLInputElement>(null);

  const liHint = touched.li ? linkedinHint(li) : null;
  const igHint = touched.ig ? instagramHint(ig) : null;
  const parsed = useMemo(() => parseBulk(bulk), [bulk]);
  const okCount = parsed.filter((p) => !p.hint).length;

  async function submit(kind: "single" | "bulk") {
    setError(null);
    setLineErrors([]);
    setAccepted([]);
    const payload =
      kind === "single"
        ? {
            pool: "live",
            people: [
              {
                linkedin: li.trim(),
                instagram: ig.trim(),
                ...(gender !== "unspecified" ? { gender } : {}),
                ...(seeking !== "everyone" ? { seeking } : {}),
              },
            ],
          }
        : { pool: "live", text: bulk };
    setBusy(kind);
    const res = await api<AddResponse>("/api/people", { method: "POST", json: payload });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      const errs = (res.data?.errors as LineError[] | undefined) ?? [];
      setLineErrors(errs);
      return;
    }
    const { accepted: acc = [], errors = [] } = res.data ?? { accepted: [], errors: [] };
    setAccepted(acc);
    setLineErrors(errors);
    if (acc.length && !errors.length) {
      router.push("/pool/live");
      return;
    }
    if (!acc.length && !errors.length) setError("Nothing was added. Check the links and try again.");
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setBulk(String(reader.result ?? ""));
    reader.readAsText(f);
    e.target.value = "";
  }

  return (
    <div className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line lg:grid-cols-2">
      {/* One person */}
      <form
        data-testid="add-single-form"
        className="bg-ink-2 p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched({ li: true, ig: true });
          if (!li.trim() || !ig.trim()) {
            setError("Add both links: the LinkedIn profile and the public Instagram.");
            return;
          }
          void submit("single");
        }}
        noValidate
      >
        <h3 className="font-display text-2xl">One person</h3>
        <p className="mt-1 text-sm text-mute">Their two official links. Instagram must be public.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor={`${id}-li`} className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <LinkedInIcon size={15} className="text-[#7fb6ea]" /> LinkedIn profile
            </label>
            <input
              id={`${id}-li`}
              name="linkedin"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.linkedin.com/in/jane-doe"
              className={field}
              value={li}
              onChange={(e) => setLi(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, li: true }))}
              aria-invalid={Boolean(liHint)}
              aria-describedby={liHint ? `${id}-li-hint` : undefined}
            />
            {liHint && (
              <p id={`${id}-li-hint`} className="mt-1.5 text-xs text-gold">
                {liHint}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-ig`} className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <InstagramIcon size={15} className="text-rose" /> Instagram link or @handle
            </label>
            <input
              id={`${id}-ig`}
              name="instagram"
              autoComplete="off"
              spellCheck={false}
              placeholder="@janedoe or instagram.com/janedoe"
              className={field}
              value={ig}
              onChange={(e) => setIg(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, ig: true }))}
              aria-invalid={Boolean(igHint)}
              aria-describedby={igHint ? `${id}-ig-hint` : undefined}
            />
            {igHint && (
              <p id={`${id}-ig-hint`} className="mt-1.5 text-xs text-gold">
                {igHint}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-g`} className="mb-1.5 block text-sm font-medium">
                I am <span className="font-normal text-faint">(optional)</span>
              </label>
              <select id={`${id}-g`} className={field} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="unspecified">Prefer not to say</option>
                <option value="woman">A woman</option>
                <option value="man">A man</option>
                <option value="nonbinary">Nonbinary</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-s`} className="mb-1.5 block text-sm font-medium">
                Interested in <span className="font-normal text-faint">(optional)</span>
              </label>
              <select id={`${id}-s`} className={field} value={seeking} onChange={(e) => setSeeking(e.target.value)}>
                <option value="everyone">Everyone</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
              </select>
            </div>
          </div>
        </div>
        <button
          type="submit"
          data-testid="submit-single"
          disabled={busy !== null}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-rose px-6 py-3 font-semibold text-ink transition hover:bg-cream disabled:cursor-wait disabled:opacity-60"
        >
          {busy === "single" ? "Sending the agent…" : "Add this person"}
        </button>
      </form>

      {/* A list */}
      <form
        data-testid="add-bulk-form"
        className="flex flex-col bg-ink-2 p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.length) {
            setError("Paste at least one line: a LinkedIn link and an Instagram link, separated by a comma.");
            return;
          }
          void submit("bulk");
        }}
        noValidate
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl">A whole list</h3>
            <p className="mt-1 text-sm text-mute">One person per line: LinkedIn, then Instagram. CSV works too.</p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-mute hover:border-cream hover:text-cream"
          >
            Load a .csv
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-label="Load a CSV file"
            onChange={onFile}
          />
        </div>
        <label htmlFor={`${id}-bulk`} className="sr-only">
          People to add, one per line
        </label>
        <textarea
          id={`${id}-bulk`}
          data-testid="bulk-textarea"
          rows={7}
          spellCheck={false}
          className={`${field} mt-5 min-h-44 flex-1 resize-y font-[inherit] text-sm leading-relaxed`}
          placeholder={
            "https://www.linkedin.com/in/jane-doe, https://www.instagram.com/janedoe\nhttps://www.linkedin.com/in/sam-lee, @samlee"
          }
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
        />
        {parsed.length > 0 && (
          <ul className="scroll-quiet mt-3 max-h-36 space-y-1 overflow-y-auto text-xs" aria-label="Line check">
            {parsed.map((p) => (
              <li key={p.line} className="flex gap-2">
                <span className="w-12 shrink-0 tabular-nums text-faint">Line {p.line}</span>
                {p.hint ? (
                  <span className="text-gold">{p.hint}</span>
                ) : (
                  <span className="truncate text-mint">Looks good: {p.raw}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          data-testid="submit-people"
          disabled={busy !== null}
          className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-rose px-6 py-3 font-semibold text-rose transition hover:bg-rose hover:text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {busy === "bulk"
            ? "Sending the agents…"
            : parsed.length
              ? `Add ${parsed.length} ${parsed.length === 1 ? "person" : "people"}${okCount < parsed.length ? ` (${parsed.length - okCount} to check)` : ""}`
              : "Add everyone on the list"}
        </button>
      </form>

      {(error || lineErrors.length > 0 || accepted.length > 0) && (
        <div className="bg-ink-2 p-6 sm:px-8 lg:col-span-2" aria-live="polite">
          {error && (
            <p role="alert" className="font-medium text-alarm">
              {error}
            </p>
          )}
          {accepted.length > 0 && (
            <p className="text-mint">
              Added {accepted.map((a) => a.displayName).join(", ")}.{" "}
              <Link href="/pool/live" className="font-semibold text-cream underline underline-offset-4">
                Watch their agents work in the live pool
              </Link>
            </p>
          )}
          {lineErrors.length > 0 && (
            <div data-testid="line-errors" className="mt-3">
              <p className="text-sm text-mute">
                {lineErrors.length === 1 ? "One line wasn't added:" : `${lineErrors.length} lines weren't added:`}
              </p>
              <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-alarm/30 bg-alarm/5">
                {lineErrors.map((e, i) => (
                  <li key={`${e.line}-${i}`} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[5rem_1fr]">
                    <span className="tabular-nums text-faint">Line {e.line}</span>
                    <span>
                      <span className="text-alarm">{e.message}</span>
                      {e.input && <span className="mt-0.5 block truncate text-xs text-faint">{e.input}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
