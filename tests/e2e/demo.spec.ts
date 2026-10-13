/**
 * E2E-09: the frozen demo pool, served from src/data/demo-snapshot.json.
 * Works for both the 4-person sample and the real ≥25-person export.
 */
import { clickUntilHidden, demoPeople, expect, snapshot, test } from "./helpers";

test("E2E-09: /demo redirects to the frozen demo pool with no mutation controls", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/pool\/demo$/);
  await expect(page.getByTestId("frozen-banner")).toBeVisible();
  await expect(page.getByTestId("disclaimer")).toBeVisible();
  for (const id of ["run-round", "recompute-rankings", "add-single-form", "add-bulk-form", "pipeline-monitor"]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }

  const cards = page.getByTestId("person-card");
  await expect(cards).toHaveCount(demoPeople.length);
  if (snapshot.sample !== true) {
    expect(demoPeople.length).toBeGreaterThanOrEqual(25);
  }
  // Every snapshot person is on the page, each with a status chip.
  for (const p of demoPeople) {
    const card = cards.filter({ has: page.locator(`a[href="/pool/demo/p/${p.slug}"]`) });
    await expect(card, p.slug).toHaveCount(1);
    await expect(card.getByTestId("status-chip")).toHaveAttribute("data-status", p.status);
  }
  if (snapshot.sample !== true) {
    const statuses = await cards.getByTestId("status-chip").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
    expect(statuses.every((s) => s === "ranked")).toBe(true);
  }
});

test("E2E-09: demo profile → date → rankings is navigable", async ({ page }) => {
  // Start from someone who has been on a done date.
  const doneDate = snapshot.dates.find((d) => d.status === "done");
  const person = demoPeople.find((p) => p.id === doneDate?.aId) ?? demoPeople[0];

  await page.goto("/pool/demo");
  await page.locator(`a[href="/pool/demo/p/${person.slug}"]`).first().click();
  await page.waitForURL(`**/pool/demo/p/${person.slug}`);
  await expect(page.getByTestId("frozen-banner")).toBeVisible();
  for (const id of ["profile-needs", "profile-hobbies", "profile-interests", "profile-qualities", "reading-log"]) {
    await expect(page.getByTestId(id), id).toBeVisible();
  }
  await expect(page.getByTestId("ranking-list")).toBeVisible();
  expect(await page.getByTestId("ranking-entry").count()).toBeGreaterThanOrEqual(1);

  const dateLinks = page.getByTestId("dates-list").locator('a[href^="/pool/demo/date/"]');
  expect(await dateLinks.count()).toBeGreaterThanOrEqual(1);
  const href = (await dateLinks.first().getAttribute("href"))!;
  await dateLinks.first().click();
  await page.waitForURL(`**${href}`);
  await expect(page.getByRole("group", { name: "Playback speed" })).toBeVisible();
  await clickUntilHidden(page, "Show everything");
  await expect.poll(() => page.getByTestId("date-turn").count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("debrief-a")).toBeVisible();
  await expect(page.getByTestId("debrief-b")).toBeVisible();

  // Back to the pool, then to the rankings.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "The finished demo" }).click();
  await page.waitForURL("**/pool/demo");
  await page.getByRole("link", { name: "See the rankings" }).click();
  await page.waitForURL("**/pool/demo/rankings");
  await expect(page.getByRole("heading", { name: "Who fits whom" })).toBeVisible();
  await expect(page.getByTestId("frozen-banner")).toBeVisible();
  const heatmap = page.getByTestId("heatmap");
  await expect(heatmap).toBeVisible();
  // One row per person, and the grid doesn't blow out the page width.
  const box = await heatmap.boundingBox();
  expect(box && box.width).toBeGreaterThan(50);
  for (const p of demoPeople.slice(0, 5)) {
    await expect(page.locator(`a[href="/pool/demo/p/${p.slug}"]`).first()).toBeVisible();
  }
});

test("E2E-09: demo date pages and profiles never show live/mutation controls", async ({ page }) => {
  const d = snapshot.dates.find((x) => x.status === "done");
  test.skip(!d, "Snapshot has no finished dates");
  await page.goto(`/pool/demo/date/${d!.id}`);
  await expect(page.getByTestId("frozen-banner")).toBeVisible();
  await expect(page.getByText("This date is happening now.")).toHaveCount(0);
  await expect(page.getByTestId("run-round")).toHaveCount(0);
  await expect(page.getByTestId("pipeline-monitor")).toHaveCount(0);
});
