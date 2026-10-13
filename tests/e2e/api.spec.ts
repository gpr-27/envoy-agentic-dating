/** API contract checks (PIPE-*): validation, read-only demo, health, status. */
import { expect, test } from "./helpers";

test("POST /api/people with invalid JSON → 400", async ({ request }) => {
  const res = await request.post("/api/people", {
    headers: { "content-type": "application/json" },
    data: "{not json",
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBeTruthy();
});

test("POST /api/people with an empty paste → 400", async ({ request }) => {
  const res = await request.post("/api/people", { data: { pool: "live", text: "   " } });
  expect(res.status()).toBe(400);
});

test("POST /api/people to an unknown pool → 400", async ({ request }) => {
  const res = await request.post("/api/people", {
    data: { pool: "nope", text: "https://www.linkedin.com/in/jane-doe, @janedoe" },
  });
  expect(res.status()).toBe(400);
});

test("POST /api/people with only invalid lines → 400 with per-line errors", async ({ request }) => {
  const res = await request.post("/api/people", {
    data: { pool: "live", text: "https://lnkd.in/abc, @a\nhttps://www.linkedin.com/company/acme, @b" },
  });
  expect(res.status()).toBe(400);
  const body = (await res.json()) as { errors: Array<{ line: number; code: string; message: string }> };
  expect(body.errors.map((e) => e.line).sort()).toEqual([1, 2]);
  expect(body.errors.map((e) => e.code)).toEqual(expect.arrayContaining(["linkedin_shortlink", "linkedin_not_person"]));
  for (const e of body.errors) expect(e.message).toBeTruthy();
});

test("Demo pool writes → 403", async ({ request }) => {
  const add = await request.post("/api/people", {
    data: { pool: "demo", text: "https://www.linkedin.com/in/jane-doe, https://www.instagram.com/janedoe/" },
  });
  expect(add.status(), "add people to demo").toBe(403);

  const round = await request.post("/api/pool/demo/round");
  expect(round.status(), "round on demo").toBe(403);

  const rank = await request.post("/api/pool/demo/rankings");
  expect(rank.status(), "recompute on demo").toBe(403);

  // Ticking the frozen pool is a harmless no-op.
  const tick = await request.post("/api/pipeline/tick?pool=demo");
  expect(tick.status()).toBe(200);
  expect(await tick.json()).toMatchObject({ progressed: 0, pendingWork: false });
});

test("GET /api/health → 200 ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("GET /api/status?pool=nope → 400; demo status is frozen", async ({ request }) => {
  expect((await request.get("/api/status?pool=nope")).status()).toBe(400);
  const demo = await request.get("/api/status?pool=demo");
  expect(demo.status()).toBe(200);
  expect(await demo.json()).toMatchObject({ pool: "demo", frozen: true, pendingWork: false });
  const live = await request.get("/api/status?pool=live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toMatchObject({ pool: "live", frozen: false });
});

test("DELETE an unknown person → 404", async ({ request }) => {
  const res = await request.delete("/api/people/p_doesnotexist00?pool=live");
  expect(res.status()).toBe(404);
});
