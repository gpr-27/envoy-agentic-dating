/**
 * Parsers for the agent prompts, used only by the offline mock provider.
 * The mock reads exactly what a real model would read (no side channel),
 * so prompt-isolation tests stay meaningful.
 */

export interface ParsedPost {
  n: number;
  url: string | null;
  location: string;
  caption: string;
  hashtags: string[];
}

export interface ParsedSources {
  li: { url: string; name: string; headline: string; location: string; about: string; experience: { n: number; title: string; company: string; desc: string }[]; skills: string[]; volunteering: string };
  ig: { url: string; handle: string; name: string; bio: string; links: string; posts: ParsedPost[] };
  identity: { nameOverlap: string; linked: boolean; handleMatch: boolean };
}

/** Content between <tag ...> and </tag>. */
export function block(text: string, tag: string): { attrs: string; body: string } | null {
  const m = text.match(new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`));
  return m ? { attrs: m[1], body: m[2] } : null;
}

/** Value of a `label: value` line. */
export function field(body: string, label: string): string {
  const m = body.match(new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : "";
}

/** Split a "a; b; c" list (stripping "(detail)" suffixes). */
export function items(value: string): string[] {
  return value
    .split(";")
    .filter((s) => !/^[^(]*\)/.test(s))
    .map((s) => s.replace(/\s*\(.*$/, "").replace(/\s*\[.*$/, "").trim())
    .filter(Boolean);
}

/** Parse the LinkedIn/Instagram/identity blocks of a reader prompt. */
export function parseSources(text: string): ParsedSources {
  const li = block(text, "linkedin_profile");
  const ig = block(text, "instagram_profile");
  const idb = block(text, "identity_signals");
  const liBody = li?.body ?? "";
  const igBody = ig?.body ?? "";
  const experience = [...liBody.matchAll(/\[experience (\d+)\] (.+?) @ (.+?)(?: \(([^)]*)\))?(?:: (.*))?$/gm)].map((m) => ({
    n: Number(m[1]),
    title: m[2].trim(),
    company: m[3].trim(),
    desc: (m[5] ?? "").trim(),
  }));
  const posts: ParsedPost[] = [];
  const chunks = igBody.split(/\n\s*\[post /).slice(1);
  for (const c of chunks) {
    const head = c.split("\n")[0];
    const n = Number(head.match(/^(\d+)\]/)?.[1] ?? posts.length + 1);
    posts.push({
      n,
      url: head.match(/url: (\S+)/)?.[1] ?? null,
      location: head.match(/at ([^·]+)/)?.[1]?.trim() ?? "",
      caption: c.match(/caption: "([\s\S]*?)"\s*$/m)?.[1] ?? "",
      hashtags: (c.match(/hashtags: (.*)$/m)?.[1] ?? "").split(/\s+/).filter(Boolean).map((h) => h.replace(/^#/, "")),
    });
  }
  const idBody = idb?.body ?? "";
  return {
    li: {
      url: li?.attrs.match(/url="([^"]*)"/)?.[1] ?? "",
      name: field(liBody, "name"),
      headline: field(liBody, "headline"),
      location: field(liBody, "location"),
      about: field(liBody, "about"),
      experience,
      skills: field(liBody, "skills").split(",").map((s) => s.trim()).filter(Boolean),
      volunteering: field(liBody, "volunteering"),
    },
    ig: {
      url: ig?.attrs.match(/url="([^"]*)"/)?.[1] ?? "",
      handle: field(igBody, "handle").replace(/^@/, ""),
      name: field(igBody, "name"),
      bio: field(igBody, "bio"),
      links: field(igBody, "links"),
      posts,
    },
    identity: {
      nameOverlap: idBody.match(/name overlap: (\w+)/)?.[1] ?? "unknown",
      linked: /links to this linkedin profile: yes/.test(idBody),
      handleMatch: /handle resembles name: yes/.test(idBody),
    },
  };
}

/** A persona brief (<your_person> + <private_agenda>) parsed back into lists. */
export interface ParsedPersona {
  name: string;
  hobbies: string[];
  interests: string[];
  character: string[];
  needs: string[];
  location: string;
}

/** Parse a persona brief block (first occurrence after `from`). */
export function parsePersona(text: string): ParsedPersona {
  const p = block(text, "your_person")?.body ?? "";
  const g = block(text, "private_agenda")?.body ?? "";
  return {
    name: field(p, "name"),
    hobbies: items(field(p, "does")),
    interests: items(field(p, "cares about")),
    character: items(field(p, "character")),
    needs: items(g.match(/find out whether they could give [^:]+:\s*(.*)$/m)?.[1] ?? ""),
    location: field(p, "based in"),
  };
}

/** Lines of the transcript section ("You (X): ..." / "Other: ..."). */
export function transcriptLines(text: string, header: string): { mine: boolean; text: string }[] {
  const start = text.indexOf(header);
  if (start < 0) return [];
  const rest = text.slice(start + header.length).split(/\n\s*\n/)[0];
  return rest
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[^:]{1,60}: /.test(l) && !l.startsWith("("))
    .map((l) => ({ mine: l.startsWith("You ("), text: l.replace(/^[^:]{1,60}:\s*/, "") }));
}
