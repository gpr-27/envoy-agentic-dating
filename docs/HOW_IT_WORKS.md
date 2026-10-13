# How Envoy works

Envoy is an agentic dating site. **Each person is represented by an agent. That agent reads its person, dates the other agents on that person's behalf, and every person gets a ranking of who fits them best.**

```
LinkedIn (public profile) ─┐
                           ├─► The agent reads both ─► Profile page ─► The agents date ─► Ranking
Instagram (public profile) ┘     (reading log)       (needs · hobbies ·   (on each person's   (who fits each
                                                       interests · more)    behalf)             person best)
```

## 1. Two official links in — nothing else

A person is exactly two links: their LinkedIn profile (`linkedin.com/in/…`) and the Instagram that belongs to them. Links are canonicalised and validated before anything runs: short links, company pages, Instagram post/reel URLs, duplicates and malformed handles are rejected line by line with a human message.

**Only public Instagram profiles are allowed.** The scraper reports the account's `private` flag; a private account is rejected (`rejected_private`) and never analysed.

**Two sources, nothing else.** The agents receive no web search or tools. Everything an agent knows about its person comes from the normalised LinkedIn + Instagram data, and every trait on a profile carries evidence pointing back to the exact LinkedIn section or Instagram post it came from. Evidence links are rebuilt in code from those references (never taken from the model), so a trait can't cite a source that wasn't read.

## 2. Scraping (Apify)

- **Instagram:** `apify/instagram-profile-scraper` → bio, external links, follower/post counts, private/verified flags and the latest 12 posts (captions, hashtags, mentions, locations, dates, image URLs).
- **LinkedIn:** `harvestapi/linkedin-profile-scraper` (no-email mode) → headline, about, every role with its description, education, skills, certifications, volunteering, languages. Automatic fallback to `bovi/linkedin-profile-scraper` if a profile isn't returned.
- Runs are **started asynchronously and polled**, in batches of ≤10 people (the free-plan per-run limit), so nothing ever blocks a serverless function.
- Normalisation strips emails, phone numbers and contact fields; only public profile data is stored. Post images and the profile photo are downloaded at scrape time (Instagram CDN links expire) and resized.
- If both profiles don't look like the same person (different names, no cross-link, different city…), the person is flagged `identity_mismatch` and a visitor can confirm or remove them.

## 3. The reader agent

Reading happens in two passes, both shown on the profile page:

1. **Read pass → reading log.** The agent goes through LinkedIn and Instagram step by step, in the first person ("Posts 2, 5 and 9 are all trailheads…"), citing the item it's looking at. Up to four post images are passed to the model as well. Scraped text is wrapped as untrusted data, so instructions hidden in a bio or caption are ignored.
2. **Synthesis pass → profile.** From the log and the sources it writes **needs** (what this person needs in a partner, phrased as inference), **hobbies**, **interests**, **other qualities** (values, personality, lifestyle, communication style, ambition, humour, aesthetic), green flags, possible dealbreakers, conversation hooks, an ideal first date, and a same-person identity check. Every item has evidence and a confidence level. Thin sources produce fewer, low-confidence items instead of invented ones. The agent never infers orientation, religion, health, ethnicity or age.

## 4. The agents date each other

- **Matchmaking.** A deterministic compatibility *prescore* (overlap of hobbies/interests/values, needs met by the other's qualities, complementarity, dealbreaker penalties) lets each agent ask out its top compatible candidates (3 per person in the demo, 2 for people added on the live site; configurable with `DATES_PER_PERSON`). Pairs are deduplicated and everyone gets at least one date. Optional "I am / interested in" preferences are respected.
- **Going out.** The two agents agree on a concrete outing grounded in both profiles (e.g. a bouldering gym and tacos because both post climbing photos).
- **The conversation.** Eight turns over three acts — *Arriving & icebreakers*, *Values, goals & dealbreakers*, *A week together & the goodbye*. **Each turn is a separate model call to the speaking agent alone.** It sees only its own person's profile, its private agenda (needs to probe, dealbreakers to watch, stories it can tell), the venue, and what the other agent *said* — never the other person's profile or private thoughts. Each turn also records a private thought for its person and a vibe score. An automated test records every prompt of a full date and asserts this isolation in both directions. (Only when the free daily AI budget is nearly used up does the router fall back to a *compact* date — one call that writes both sides under strict role-separation instructions. Such dates are clearly labelled "compact" on the replay page.)
- **Private debriefs.** Afterwards each agent reports privately to its own person: chemistry 0–10 on a calibrated rubric, what clicked, concerns, and whether it wants a second date.

The date replay page plays the whole thing back: the venue, the acts, each agent's turns, their private thoughts (toggle), vibe meters and both debriefs.

## 5. Rankings — who fits each person best

For person X and every other person Y:

- **Dated:** `score = 100 × (0.5 · X's agent's chemistry with Y + 0.3 · Y's agent's chemistry with X + 0.2 · prescore)` — your own agent's experience counts most, mutual interest counts next.
- **Not dated yet ("projected"):** `score = 80 × prescore`, labelled as projected with the overlap that drove it.
- **Mutual** when both agents want a second date.

Every person's page lists everyone else in order with the rationale; the rankings page shows each person's top five plus a compatibility heatmap.

## 6. Running on free tiers

| Concern | How it's handled |
|---|---|
| Serverless time limits (300 s) | The pipeline is a resumable state machine. Each step (start a scrape, poll it, read a person, one date turn, a debrief) is persisted; the page calls `POST /api/pipeline/tick` until done. A pool lock prevents double work. A daily cron finishes anything left unattended. |
| LLM quotas | A router runs ordered chains of free models (Gemini → Groq), with per-model requests/tokens per minute and per day, 429/503 detection, retries with jitter, JSON repair, and fallback. Usage is counted in the database. Low budget → dates switch to a labelled compact mode. |
| Apify credit | Batched runs, cost caps per run, cached normalised data (re-analysis never re-scrapes), per-IP and daily submission limits. |
| Database pausing | The finished demo is a frozen snapshot bundled with the app (works with no database at all); a GitHub Action pings `/api/health` every two days to keep the free Supabase project awake. |

## 7. Privacy & safety

Public data only; private Instagram rejected; emails/phones stripped; evidence links rebuilt in code; `noindex` on every page; a disclaimer on every page; a working **Remove this person** button that hides the person, deletes their scraped data and profile, and removes them from every ranking (the frozen demo always keeps at least 25 people); visitor IPs are only stored as salted hashes for rate limiting; database access is server-only (RLS on, no public grants).

## 8. Models behind the demo

The agents (prompts, isolation rules, pipeline) are the same everywhere; only the model behind them is configurable. The frozen demo pool was generated locally with **Claude Haiku 5.5**. The live site runs the same agents on free-tier models (Gemini, Groq) through the router. Every profile and date records which model produced it.
