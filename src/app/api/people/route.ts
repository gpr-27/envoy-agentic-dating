import { z } from "zod";
import { PersonInput } from "@/lib/contracts";
import { fail, handleError, json, poolOr400 } from "@/lib/api";
import { createPeople, MAX_PER_SUBMISSION } from "@/lib/pipeline";
import { allow } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({
  pool: z.string().optional(),
  text: z.string().max(20_000).optional(),
  people: z.array(PersonInput).max(MAX_PER_SUBMISSION * 2).optional(),
});

/** Paste links in: validate two official links per person and enqueue them. */
export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return fail(400, "Send JSON like { pool: 'live', text: 'linkedin-url, instagram-url' }.");
  }
  const pool = poolOr400(body.pool);
  if (pool instanceof Response) return pool;
  if (!body.text?.trim() && !body.people?.length) {
    return fail(400, "Paste at least one LinkedIn + Instagram pair.");
  }
  // Generous cap on attempts (fixing typos must not lock anyone out); the
  // stricter cap below only counts submissions that actually added people.
  if (!(await allow(req, "people-attempt", 30, 600))) {
    return fail(429, "Too many attempts from you in the last 10 minutes. Please wait a bit.");
  }
  if (!(await allow(req, "people-accepted", 5, 600, { peek: true }))) {
    return fail(429, "You've added people 5 times in the last 10 minutes. Please let the agents catch up.");
  }
  try {
    const res = await createPeople(pool, { text: body.text, people: body.people });
    if (!res.accepted.length) {
      return fail(400, "None of the lines could be accepted.", { errors: res.errors });
    }
    await allow(req, "people-accepted", 5, 600);
    return json(res, 201);
  } catch (e) {
    return handleError(e);
  }
}
