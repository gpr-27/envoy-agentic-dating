/**
 * E2E-06: private / not-found Instagram → rejected with a clear message, no profile.
 * E2E-07: invalid lines → per-line errors, nothing enqueued.
 */
import { cardFor, cardStatus, expect, IS_MOCK, personLinks, runTag, submitBulk, test } from "./helpers";

test.describe("E2E-06 rejected accounts (mock scrapers)", () => {
  test.skip(!IS_MOCK, "Relies on MOCK_EXTERNALS handle conventions");

  const cases = [
    {
      name: "private Instagram",
      first: "pia",
      handle: (tag: string) => `pia.private.${tag}`,
      status: "rejected_private",
      label: "Private Instagram",
      message: /Instagram is private|account is private/,
    },
    {
      name: "Instagram not found",
      first: "nell",
      handle: (tag: string) => `nell.notfound.${tag}`,
      status: "rejected_invalid",
      label: "Profile not found",
      message: /isn't a public profile|couldn't find a public Instagram/,
    },
  ];

  for (const c of cases) {
    test(`${c.name} → ${c.status} message, no profile`, async ({ page }) => {
      test.setTimeout(180_000);
      const tag = runTag();
      const p = personLinks(c.first, tag, c.handle(tag));
      await submitBulk(page, `${p.linkedin}, ${p.instagram}`);
      await page.waitForURL("**/pool/live", { timeout: 30_000 });
      await expect(cardFor(page, "live", p.slug)).toHaveCount(1);

      await expect
        .poll(() => cardStatus(page, "live", p.slug), { timeout: 120_000, intervals: [1000, 2000] })
        .toBe(c.status);
      const chip = cardFor(page, "live", p.slug).getByTestId("status-chip");
      await expect(chip).toHaveText(c.label);

      // The pipeline monitor explains why, in words.
      const monitor = page.getByTestId("pipeline-monitor");
      const row = monitor.locator("li").filter({ has: page.locator(`a[href="/pool/live/p/${p.slug}"]`) });
      await expect(row).toContainText(c.message);

      // The profile page says the agent couldn't read them, and has no analysis.
      await page.goto(`/pool/live/p/${p.slug}`);
      await expect(page.getByRole("heading", { name: /The agent couldn't read/ })).toBeVisible();
      await expect(page.getByText(c.message).first()).toBeVisible();
      await expect(page.getByTestId("profile-needs")).toHaveCount(0);
      await expect(page.getByTestId("reading-log")).toHaveCount(0);
    });
  }
});

test("E2E-07 invalid lines → per-line errors, nothing enqueued", async ({ page }) => {
  const tag = runTag();
  const before = (await (await page.request.get("/api/status?pool=live")).json()) as { people: Array<{ slug: string }> };
  const lines = [
    `https://lnkd.in/gAbCdEf, @shorty.${tag}`,
    `https://www.linkedin.com/company/acme-${tag}, https://www.instagram.com/acme.${tag}/`,
    `https://www.linkedin.com/in/zed-${tag}, https://www.instagram.com/p/C0deP0st${tag}/`,
  ];
  await submitBulk(page, lines.join("\n"));

  const errors = page.getByTestId("line-errors");
  await expect(errors).toBeVisible();
  const items = errors.locator("li");
  await expect(items).toHaveCount(3);
  for (const n of [1, 2, 3]) await expect(items.filter({ hasText: `Line ${n}` })).toHaveCount(1);
  await expect(errors).toContainText("3 lines weren't added");
  // Stayed on the start page: nothing was accepted.
  await expect(page).toHaveURL(/\/$|\/#add$/);
  await expect(page.getByText(/^Added /)).toHaveCount(0);

  const after = (await (await page.request.get("/api/status?pool=live")).json()) as { people: Array<{ slug: string }> };
  const added = after.people.filter((p) => !before.people.some((b) => b.slug === p.slug));
  expect(added.filter((p) => p.slug.includes(tag))).toEqual([]);
});

test("E2E-07b mixed paste: the good line is added, the bad line is reported", async ({ page }) => {
  test.skip(!IS_MOCK, "Adds a synthetic person");
  const tag = runTag();
  const good = personLinks("ola", tag);
  await submitBulk(page, `${good.linkedin}, ${good.instagram}\nhttps://lnkd.in/xyz, @bad.${tag}`);
  const errors = page.getByTestId("line-errors");
  await expect(errors).toBeVisible();
  await expect(errors.locator("li")).toHaveCount(1);
  await expect(errors).toContainText("Line 2");
  await expect(page.getByText(/^Added /)).toBeVisible();
  // Clean up so the live pool only holds what other tests expect.
  const status = (await (await page.request.get("/api/status?pool=live")).json()) as {
    people: Array<{ id: string; slug: string }>;
  };
  const me = status.people.find((p) => p.slug === good.slug);
  expect(me).toBeTruthy();
  const del = await page.request.delete(`/api/people/${me!.id}?pool=live`);
  expect(del.status()).toBe(200);
});
