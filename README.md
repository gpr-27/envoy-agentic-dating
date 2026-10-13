# Envoy — an agentic dating site

**Each person is represented by an agent. That agent reads its person, then dates the other agents on that person's behalf, and every person gets a ranking of who fits them best.**

Paste two official links per person (a LinkedIn profile and a **public** Instagram). Envoy:

1. **Scrapes both public profiles** with Apify (and nothing else — they are the only two sources).
2. **The reader agent reads its person** in two passes — a visible, evidence-linked *reading log*, then a profile of **needs, hobbies, interests and other qualities**, every trait citing the LinkedIn or Instagram item it came from.
3. **The agents go out on dates.** Each agent asks out its best-fitting candidates; the two agents pick a real outing from both profiles and talk through three acts, **each turn a separate model call that only knows its own person**, with private thoughts, then each agent privately debriefs its person.
4. **Ranks who fits each person best** from both agents' debriefs plus profile compatibility.

- **Demo (already run, 29 real public figures):** https://envoy-agentic-dating.vercel.app/pool/demo
- **Live (paste your own links):** https://envoy-agentic-dating.vercel.app
- **How it works (full explanation):** `/how-it-works` and [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md)

> Privacy: the demo uses only public LinkedIn/Instagram data of public figures for a technical exercise. Private Instagram accounts are rejected, emails/phone numbers are stripped, every page is `noindex`, and every profile has a working **Remove this person** button. Not affiliated with anyone shown.

## Architecture

```
 LinkedIn URL ─┐                          ┌─► Profile page (needs · hobbies · interests · qualities)
               ├─► Apify scrapers ─► Reader agent ─┤
 Instagram URL ┘   (batched, async)   (read → synthesize)  └─► Matchmaker ─► Dates (plan → 8 turns → 2 debriefs) ─► Rankings
```

| Layer | What | Where |
|---|---|---|
| Contracts | zod schemas shared by every module | `src/lib/contracts.ts` |
| Scraping | URL canonicalisation, Apify actors (async runs + polling), normalisation, PII scrubbing, image capture | `src/lib/scrape/` |
| LLM router | Gemini (free) → Groq (free) fallback chains, RPM/TPM/RPD/TPD limiting, JSON repair, quota detection | `src/lib/llm/` |
| Agents | reader, persona, matchmaker, date, debrief, ranking — prompts in `prompts/` | `src/lib/agents/` |
| Pipeline | resumable state machine advanced by idempotent `tick()`s; pool lock | `src/lib/pipeline/` |
| Storage | Supabase Postgres (live), JSON file (local/dev), frozen snapshot (demo) | `src/lib/store/`, `supabase/migrations/` |
| UI | Next.js App Router pages + small client components | `src/app/`, `src/components/` |

**Why ticks?** Vercel Hobby functions stop at 300 s and Apify's synchronous API stops at 300 s too. Every unit of work (start a scrape, poll it, read a person, one date turn, a debrief) is persisted before the next starts, so the browser (or the daily cron) keeps calling `POST /api/pipeline/tick` and the work resumes exactly where it stopped.

## Scraping stack

- **Apify** (free plan, $5/month credit, no card):
  - Instagram: `apify/instagram-profile-scraper` — bio, external links, counts, `private` flag, latest 12 posts (captions, hashtags, locations, image URLs).
  - LinkedIn: `harvestapi/linkedin-profile-scraper` in no-email mode (headline, about, every role with descriptions, education, skills, certifications, volunteering) with `bovi/linkedin-profile-scraper` as automatic fallback.
  - One batched async run per platform per submission; runs are polled, never awaited synchronously.
- Normalised with zod; emails/phones/contact fields stripped; post images and the avatar downloaded at scrape time (Instagram CDN links expire) and resized with `sharp`.

## Models (all free tiers)

The router runs an ordered chain of free models per task and moves down the chain on rate limits, quota exhaustion, 5xx or invalid JSON. Calls are spread across the models that can serve soonest (free quotas are per model). Chains are set with `LLM_CHAIN_ANALYSIS`, `LLM_CHAIN_DATE`, `LLM_CHAIN_DEBRIEF` (see `.env.example`); limits with `LLM_RPM_*`, `LLM_RPD_*`, `LLM_TPM_*`, `LLM_TPD_*`.

| Task | Chain in `.env.example` |
|---|---|
| Reading + profile synthesis | Gemini 3 Flash (preview) → Gemini 3.8 Flash → Groq `gpt-oss-120b` → Groq `qwen3.8-27b` → more Gemini models |
| Date plan + turns | Groq `gpt-oss-120b` → `qwen3.8-27b` → `gpt-oss-20b` → Gemini models |
| Debriefs | Groq `gpt-oss-20b` → `qwen3.8-27b` → `gpt-oss-120b` → Gemini models |

The frozen demo pool was generated locally with **Claude Haiku 5.5**; the live site runs the same agents on the free-tier chains above. Each profile and date stores the model that produced it.

Measured free-tier limits: Gemini allows 20 requests/day per model; Groq allows 8K tokens/minute and 200K tokens/day per model. When the daily date budget runs low, new dates switch to a labelled compact mode instead of failing.

## What this demonstrates

- **Instagram + LinkedIn wired into one agent**: two scrapers, one normalised, evidence-linked view of a person.
- **Agents that speak in a real person's voice**: each date agent talks in first person as its person, from that person's profile only (isolation is tested).
- **Persistent memory**: Postgres (Supabase) holds people, profiles, dates and rankings; the pipeline is a resumable state machine.
- **Production-minded agent infrastructure**: multi-provider routing with per-model request/token budgets, fallbacks, quota-aware degradation, prompt-injection hardening, rate limiting and privacy controls, all on free tiers.

## Run locally

```bash
npm install
cp .env.example .env.local      # fill in keys, or set MOCK_EXTERNALS=1 to run fully offline
npm run dev                     # http://localhost:3000
```

Without Supabase variables the app stores data in `.data/db.json`.

| Command | What |
|---|---|
| `npm test` | unit + integration tests (offline, mocked externals) |
| `npm run e2e` | Playwright end-to-end against a local mocked server |
| `BASE_URL=https://… npm run e2e:prod` | Playwright against a deployment |
| `npm run seed` | run the real pipeline for `data/people.csv` into the local demo pool |
| `npm run export` | freeze the demo pool into `src/data/demo-snapshot.json` |
| `npx tsx scripts/import-live.ts` | copy the demo into the live pool of the configured store |
| `npx tsx scripts/smoke-llm.ts` | check model availability/latency with your keys |

## Deploy

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`.
2. `vercel` → set env vars from `.env.example` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APIFY_TOKEN`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `CRON_SECRET`, `IP_HASH_SALT`, …) → `vercel --prod`.
3. Set the GitHub repository variable `SITE_URL` so the keep-alive workflow pings `/api/health` every two days (free Supabase projects pause after a week idle).

## The people

`data/people.csv` lists the 30 public figures in the demo; `data/people-verification.md` records, for each, the evidence that the LinkedIn and the Instagram belong to the same person (both links taken from the person's own website).
