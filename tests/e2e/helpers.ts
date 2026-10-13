import { test as base, expect, type Page } from "@playwright/test";
import snapshotJson from "../../src/data/demo-snapshot.json";

/**
 * Shared E2E helpers.
 *
 * Every test gets its own fake client IP (X-Forwarded-For) so the per-IP rate
 * limits on POST /api/people (5 per 10 min) and /round (3 per 10 min) don't
 * make tests depend on each other or on how often the suite was run. On a real
 * deployment the edge overwrites this header, so it is harmless there.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide, testInfo) => {
    const n = (Date.now() + testInfo.workerIndex * 7919 + testInfo.retry * 104729 + hashString(testInfo.testId)) >>> 0;
    await provide({ "x-forwarded-for": `10.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}` });
  },
});
export { expect };

/** True when the suite starts its own mocked server (MOCK_EXTERNALS=1). */
export const IS_MOCK = !process.env.BASE_URL || process.env.E2E_MOCK === "1";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A letters-only run tag. Digits are stripped from display names (and runs of
 * hex letters are treated as ids), so map digits to g–p and prefix with "q".
 */
export function runTag(len = 7): string {
  const raw = (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(-len);
  return "q" + raw.replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)]);
}

/** A person whose LinkedIn and Instagram clearly belong together (name tokens overlap). */
export function personLinks(first: string, tag: string, igHandle?: string) {
  const slug = `${first}-${tag}`;
  return {
    slug,
    linkedin: `https://www.linkedin.com/in/${slug}`,
    instagram: `https://www.instagram.com/${igHandle ?? `${first}.${tag}`}/`,
  };
}

export interface Snapshot {
  sample?: boolean;
  people: Array<{ id: string; slug: string; displayName: string; status: string; hidden?: boolean }>;
  dates: Array<{ id: string; aId: string; bId: string; status: string; transcript: unknown[] }>;
}
export const snapshot = snapshotJson as unknown as Snapshot;
export const demoPeople = snapshot.people.filter((p) => !p.hidden);

export const NOT_FOUND_TEXT = "This page isn't here";

/** The person card that links to /pool/<pool>/p/<slug>. */
export function cardFor(page: Page, pool: string, slug: string) {
  return page.getByTestId("person-card").filter({ has: page.locator(`a[href="/pool/${pool}/p/${slug}"]`) });
}

/** Current status of a person card ("" when absent). */
export async function cardStatus(page: Page, pool: string, slug: string): Promise<string> {
  const chip = cardFor(page, pool, slug).getByTestId("status-chip");
  if ((await chip.count()) === 0) return "";
  return (await chip.first().getAttribute("data-status")) ?? "";
}

/** Fill the bulk textarea on "/" and submit it. */
export async function submitBulk(page: Page, text: string) {
  await page.goto("/");
  const form = page.getByTestId("add-bulk-form");
  await form.getByTestId("bulk-textarea").fill(text);
  await form.getByTestId("submit-people").click();
}

/** No horizontal overflow on the current page. */
export async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; innerWidth: number; culprits: string[] }> {
  return page.evaluate(() => {
    const se = document.scrollingElement ?? document.documentElement;
    const iw = window.innerWidth;
    const culprits: string[] = [];
    if (se.scrollWidth > iw + 1) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const r = el.getBoundingClientRect();
        if (r.right > iw + 1 && r.width > 0) {
          const desc = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.className).split(/\s+/).slice(0, 4).join(".")} right=${Math.round(r.right)}`;
          culprits.push(desc);
          if (culprits.length >= 8) break;
        }
      }
    }
    return { scrollWidth: se.scrollWidth, innerWidth: iw, culprits };
  });
}

/** Elements on the page that lack an accessible name. */
export async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const nameOf = (el: HTMLElement): string => {
      const aria = el.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const by = el.getAttribute("aria-labelledby");
      if (by) {
        const t = by
          .split(/\s+/)
          .map((id) => text(document.getElementById(id)))
          .join(" ")
          .trim();
        if (t) return t;
      }
      const labels = (el as HTMLInputElement).labels;
      if (labels && labels.length) {
        const t = Array.from(labels).map(text).join(" ").trim();
        if (t) return t;
      }
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "button") {
        const t = text(el);
        if (t) return t;
        const img = el.querySelector("img[alt]");
        if (img?.getAttribute("alt")?.trim()) return img.getAttribute("alt")!.trim();
      }
      if (el.tagName === "INPUT" && ["submit", "button", "reset"].includes((el as HTMLInputElement).type)) {
        const v = (el as HTMLInputElement).value?.trim();
        if (v) return v;
      }
      return el.getAttribute("title")?.trim() ?? "";
    };
    const out: string[] = [];
    const nodes = document.querySelectorAll<HTMLElement>("input, select, textarea, button, [role=button]");
    for (const el of Array.from(nodes)) {
      if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "hidden") continue;
      if (!nameOf(el)) out.push(el.outerHTML.slice(0, 160));
    }
    return out;
  });
}

/** Click a client-side control until it takes effect (guards against clicks before hydration). */
export async function clickUntilHidden(page: Page, name: string) {
  const btn = page.getByRole("button", { name, exact: true });
  await expect(async () => {
    if (await btn.isVisible()) await btn.click({ timeout: 2_000 });
    await expect(btn).toBeHidden({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}
