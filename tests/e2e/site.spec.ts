/**
 * UI-01 / PIPE-15: disclaimer on every page; noindex meta + X-Robots-Tag header.
 * Plus missing pages and the how-it-works page.
 */
import { demoPeople, expect, NOT_FOUND_TEXT, snapshot, test } from "./helpers";

const firstDone = snapshot.dates.find((d) => d.status === "done");
const pages = [
  "/",
  "/how-it-works",
  "/pool/demo",
  "/pool/demo/rankings",
  `/pool/demo/p/${demoPeople[0].slug}`,
  ...(firstDone ? [`/pool/demo/date/${firstDone.id}`] : []),
  "/pool/live",
  "/pool/live/rankings",
  "/pool/demo/p/no-such-person",
];

for (const path of pages) {
  test(`UI-01: disclaimer + noindex on ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res, "navigation response").toBeTruthy();
    expect(res!.headers()["x-robots-tag"] ?? "").toMatch(/noindex/i);
    const disclaimer = page.getByTestId("disclaimer");
    await expect(disclaimer).toBeVisible();
    await expect(disclaimer).toContainText("AI simulation");
    await expect(disclaimer).toContainText("Remove this person");
    // Every robots meta (not-found pages may carry more than one) must say noindex.
    const robots = page.locator('meta[name="robots"]');
    await expect(robots.first()).toBeAttached();
    const contents = await robots.evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
    expect(contents.length).toBeGreaterThanOrEqual(1);
    for (const c of contents) expect(c).toMatch(/noindex/);
  });
}

test("Missing pages render the not-found message", async ({ page }) => {
  for (const path of [
    "/pool/demo/p/definitely-not-a-person",
    "/pool/demo/date/d_nope",
    "/pool/nope",
    "/pool/live/p/definitely-not-a-person",
    "/this/does/not/exist",
  ]) {
    await page.goto(path);
    await expect(page.getByText(NOT_FOUND_TEXT), path).toBeVisible();
    await expect(page.getByTestId("disclaimer")).toBeVisible();
  }
});

test("X-Robots-Tag on API and page responses (request level)", async ({ request }) => {
  for (const path of ["/", "/pool/demo", "/api/health"]) {
    const res = await request.get(path);
    expect(res.headers()["x-robots-tag"] ?? "", path).toMatch(/noindex/i);
  }
});

test("UI-08: how-it-works covers sources, harness, scraping and privacy", async ({ page }) => {
  await page.goto("/how-it-works");
  const body = page.locator("main");
  await expect(body).toContainText(/LinkedIn/);
  await expect(body).toContainText(/Instagram/);
  await expect(page.locator("#privacy")).toHaveCount(1);
});

test("UI-01: home has hero, diagram, add-people forms (single + bulk + CSV)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("add-single-form")).toBeVisible();
  await expect(page.getByTestId("add-bulk-form")).toBeVisible();
  await expect(page.getByTestId("submit-single")).toBeVisible();
  await expect(page.getByTestId("submit-people")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load a .csv" })).toBeVisible();
});

test("UI-02: client-side hints flag bad lines before submit", async ({ page }) => {
  await page.goto("/");
  await page
    .getByTestId("bulk-textarea")
    .fill("https://lnkd.in/abc, @someone\nhttps://www.linkedin.com/in/jane-doe, https://www.instagram.com/janedoe/");
  const check = page.getByRole("list", { name: "Line check" });
  await expect(check).toContainText("Shortlinks don't work");
  await expect(check).toContainText("Looks good");
  await expect(page.getByTestId("submit-people")).toHaveText(/Add 2 people \(1 to check\)/);
});
