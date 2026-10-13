/**
 * E2E-01..05 + pool actions + E2E-08: the grader journey on the LIVE pool.
 * Runs serially: add two people → wait until ranked → profile → date →
 * rankings → round/recompute → remove one of them.
 */
import { cardFor, clickUntilHidden, cardStatus, expect, IS_MOCK, NOT_FOUND_TEXT, personLinks, runTag, submitBulk, test } from "./helpers";

test.describe.configure({ mode: "serial" });

const tag = runTag();
// Real pairs for a production run can be supplied as "li,ig;li,ig" in E2E_PAIRS.
const envPairs = process.env.E2E_PAIRS?.split(";").map((p) => p.split(",").map((s) => s.trim()));
const A = envPairs?.[0] ? linksFrom(envPairs[0]) : personLinks("ivy", tag);
const B = envPairs?.[1] ? linksFrom(envPairs[1]) : personLinks("noah", tag);

function linksFrom([linkedin, instagram]: string[]) {
  const slug = (linkedin.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? "").toLowerCase();
  return { slug, linkedin, instagram };
}

/** Filled in as the journey goes. */
let dateUrl = "";

test.skip(!IS_MOCK && !envPairs, "Production journey needs E2E_PAIRS with real links");

test("E2E-01/02: bulk-paste two pairs, both get queued and reach ranked", async ({ page }) => {
  test.setTimeout(300_000);
  await submitBulk(page, `${A.linkedin}, ${A.instagram}\n${B.linkedin}, ${B.instagram}`);

  await page.waitForURL("**/pool/live", { timeout: 30_000 });
  await expect(page.getByTestId("disclaimer")).toBeVisible();
  await expect(page.getByTestId("pipeline-monitor")).toBeVisible();
  await expect(cardFor(page, "live", A.slug)).toHaveCount(1);
  await expect(cardFor(page, "live", B.slug)).toHaveCount(1);

  // The pool page's pipeline monitor drives ticks while it is open. Poll the UI.
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        const [a, b] = [await cardStatus(page, "live", A.slug), await cardStatus(page, "live", B.slug)];
        seen.add(a).add(b);
        return [a, b];
      },
      { timeout: IS_MOCK ? 180_000 : 540_000, intervals: [1000, 2000] },
    )
    .toEqual(["ranked", "ranked"]);
  test.info().annotations.push({ type: "statuses seen", description: [...seen].filter(Boolean).join(" → ") });

  // No rejections or failures surfaced for them along the way.
  expect([...seen].filter((s) => /rejected|failed|identity/.test(s))).toEqual([]);
});

test("E2E-03: profile has every analysis section, a reading log and evidence with sources", async ({ page }) => {
  await page.goto(`/pool/live/p/${A.slug}`);
  await expect(page.getByTestId("disclaimer")).toBeVisible();
  for (const id of ["profile-needs", "profile-hobbies", "profile-interests", "profile-qualities"]) {
    const section = page.getByTestId(id);
    await expect(section, id).toBeVisible();
    expect(await section.locator("li").count(), `${id} items`).toBeGreaterThanOrEqual(1);
  }

  // Reading log: present, and after skipping to the end its evidence chips render.
  const log = page.getByTestId("reading-log");
  await expect(log).toBeVisible();
  await expect(page.getByTestId("reading-log")).toBeVisible();
  await clickUntilHidden(page, "Skip to the end");
  await expect(log.getByText(/^Read \d+ things, then wrote the profile$/)).toBeVisible();
  const logChips = log.getByTestId("evidence-chip");
  expect(await logChips.count()).toBeGreaterThanOrEqual(1);
  const target = await logChips.first().getAttribute("data-target");
  await logChips.first().click();
  if (target) await expect(page.locator(`[id="${target}"]`)).toHaveCount(1);

  // An evidence toggle on a trait opens a popover naming the source.
  const needs = page.getByTestId("profile-needs");
  await needs.getByRole("button", { name: /^Evidence \(\d+\)$/ }).first().click();
  const pop = needs.getByTestId("evidence-popover").first();
  await expect(pop).toBeVisible();
  await expect(pop).toContainText(/(LinkedIn|Instagram), \S/);
  const links = pop.locator("a[href]");
  if (await links.count()) {
    await expect(links.first()).toHaveAttribute("href", /^https:\/\/(www\.)?(linkedin|instagram)\.com\//);
  }
});

test("E2E-04: dates list → date replay with ≥6 turns and both debriefs", async ({ page }) => {
  await page.goto(`/pool/live/p/${A.slug}`);
  const datesList = page.getByTestId("dates-list");
  await expect(datesList).toBeVisible();
  const dateLinks = datesList.locator('a[href*="/pool/live/date/"]');
  expect(await dateLinks.count()).toBeGreaterThanOrEqual(1);
  dateUrl = (await dateLinks.first().getAttribute("href")) ?? "";
  expect(dateUrl).toMatch(/^\/pool\/live\/date\/[\w-]+$/);

  await dateLinks.first().click();
  await page.waitForURL(`**${dateUrl}`);
  await expect(page.getByTestId("disclaimer")).toBeVisible();
  await expect(page.getByRole("group", { name: "Playback speed" })).toBeVisible();
  await clickUntilHidden(page, "Show everything");
  await expect.poll(() => page.getByTestId("date-turn").count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("debrief-a")).toBeVisible();
  await expect(page.getByTestId("debrief-b")).toBeVisible();
  // Three acts are labelled in the transcript.
  for (const n of [1, 2, 3]) await expect(page.getByText(new RegExp(`^Act ${n},`))).toBeVisible();
});

test("E2E-05: each new person's ranking includes the other", async ({ page }) => {
  for (const [me, other] of [
    [A, B],
    [B, A],
  ]) {
    await page.goto(`/pool/live/p/${me.slug}`);
    const list = page.getByTestId("ranking-list");
    await expect(list).toBeVisible();
    const entries = list.getByTestId("ranking-entry");
    expect(await entries.count()).toBeGreaterThanOrEqual(1);
    const entry = entries.filter({ has: page.locator(`a[href="/pool/live/p/${other.slug}"]`) });
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveAttribute("data-label", /^(dated|projected)$/);
    await expect(entry.getByLabel(/^Score \d+ out of 100$/)).toBeVisible();
  }
  await page.goto("/pool/live/rankings");
  await expect(page.getByRole("heading", { name: "Who fits whom" })).toBeVisible();
  await expect(page.getByTestId("heatmap")).toBeVisible();
});

test("Pool actions: run a round and recompute rankings", async ({ page }) => {
  await page.goto("/pool/live");
  const status = page.getByRole("status");

  const round = page.getByTestId("run-round");
  await expect(round).toBeEnabled();
  await round.click();
  await expect(status).toHaveText(/on the calendar|No new pairs to send out/, { timeout: 30_000 });
  await expect(status).toHaveClass(/text-mint/);

  const recompute = page.getByTestId("recompute-rankings");
  await expect(recompute).toBeEnabled();
  await recompute.click();
  await expect(status).toHaveText("Rankings recomputed from every finished date.", { timeout: 30_000 });
  await expect(status).toHaveClass(/text-mint/);
});

test("E2E-08: remove a person → gone from pool, profile and date 404, not in rankings", async ({ page }) => {
  await page.goto(`/pool/live/p/${B.slug}`);
  const remove = page.getByTestId("remove-person");
  await remove.click();
  await expect(remove).toHaveAttribute("data-confirm", "true");
  await remove.click();
  await page.waitForURL("**/pool/live", { timeout: 30_000 });
  await expect(cardFor(page, "live", B.slug)).toHaveCount(0);
  await expect(cardFor(page, "live", A.slug)).toHaveCount(1);

  await page.goto(`/pool/live/p/${B.slug}`);
  await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible();

  if (dateUrl) {
    await page.goto(dateUrl);
    await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible();
  }

  await page.goto(`/pool/live/p/${A.slug}`);
  await expect(page.getByTestId("ranking-list")).toBeVisible();
  await expect(page.getByTestId("ranking-list").locator(`a[href="/pool/live/p/${B.slug}"]`)).toHaveCount(0);

  await page.goto("/pool/live/rankings");
  await expect(page.locator(`a[href="/pool/live/p/${B.slug}"]`)).toHaveCount(0);

  const res = await page.request.get("/api/status?pool=live");
  const body = (await res.json()) as { people: Array<{ slug: string }> };
  expect(body.people.map((p) => p.slug)).not.toContain(B.slug);
});
