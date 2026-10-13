/**
 * E2E-11: basic a11y without extra deps (labelled form controls, named buttons).
 * E2E-13: 390×844 viewport has no horizontal overflow on key pages.
 */
import { clickUntilHidden, demoPeople, expect, horizontalOverflow, snapshot, test, unnamedControls } from "./helpers";

const doneDate = snapshot.dates.find((d) => d.status === "done");
const profileSlug = (demoPeople.find((p) => p.id === doneDate?.aId) ?? demoPeople[0]).slug;

test.describe("E2E-11 accessible names", () => {
  test("every input/select/textarea and button on / has an accessible name", async ({ page }) => {
    await page.goto("/");
    // Labelled via <label for>, so getByLabel finds them.
    await expect(page.getByLabel("LinkedIn profile")).toBeVisible();
    await expect(page.getByLabel("Instagram link or @handle")).toBeVisible();
    await expect(page.getByLabel(/I am/)).toBeVisible();
    await expect(page.getByLabel(/Interested in/)).toBeVisible();
    await expect(page.getByLabel("People to add, one per line")).toBeVisible();
    // Type something so the line-check list renders too.
    await page.getByTestId("bulk-textarea").fill("https://lnkd.in/x, @y");
    expect(await unnamedControls(page)).toEqual([]);
  });

  test("demo profile and date page controls have accessible names", async ({ page }) => {
    await page.goto(`/pool/demo/p/${profileSlug}`);
    await expect(page.getByTestId("reading-log")).toBeVisible();
    expect(await unnamedControls(page), "profile").toEqual([]);
    if (doneDate) {
      await page.goto(`/pool/demo/date/${doneDate.id}`);
      await expect(page.getByTestId("date-turn").first()).toBeVisible({ timeout: 15_000 });
      expect(await unnamedControls(page), "date").toEqual([]);
    }
  });

  test("the add-people flow works with the keyboard only (E2E-12 smoke)", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("People to add, one per line").focus();
    await page.keyboard.type("https://lnkd.in/abc, @nobody");
    // Tab to the bulk submit button and press Enter.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      if ((await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "submit-people") break;
    }
    expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("submit-people");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("line-errors")).toBeVisible();
  });
});

test.describe("E2E-13 mobile viewport 390×844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const targets = [
    { name: "home", path: "/" },
    { name: "profile", path: `/pool/demo/p/${profileSlug}` },
    ...(doneDate ? [{ name: "date", path: `/pool/demo/date/${doneDate.id}` }] : []),
    { name: "rankings", path: "/pool/demo/rankings" },
  ];

  for (const t of targets) {
    test(`no horizontal overflow on ${t.name}`, async ({ page }) => {
      await page.goto(t.path);
      await page.waitForLoadState("load");
      if (t.name === "profile") {
        await expect(page.getByTestId("reading-log")).toBeVisible();
        await clickUntilHidden(page, "Skip to the end");
        await page.getByRole("button", { name: /^Evidence \(\d+\)$/ }).first().click();
        await expect(page.getByTestId("evidence-popover").first()).toBeVisible();
      }
      if (t.name === "date") {
        await expect(page.getByRole("group", { name: "Playback speed" })).toBeVisible();
        await clickUntilHidden(page, "Show everything");
        await expect.poll(() => page.getByTestId("date-turn").count()).toBeGreaterThanOrEqual(6);
        await expect(page.getByTestId("debrief-a")).toBeVisible();
        // Readable: turns are on screen and within the viewport width.
        const turn = page.getByTestId("date-turn").first();
        const box = await turn.boundingBox();
        expect(box && box.x + box.width).toBeLessThanOrEqual(391);
      }
      const o = await horizontalOverflow(page);
      expect(o.scrollWidth, `overflowing elements: ${o.culprits.join(" | ")}`).toBeLessThanOrEqual(o.innerWidth + 1);
    });
  }
});
