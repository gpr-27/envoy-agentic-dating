# Submission texts

## Overall explanation (≤ 200 characters)

Envoy: paste a LinkedIn + public Instagram. An AI agent reads the person, writes an evidence-backed profile, goes on real turn-by-turn dates with the other agents for them, then ranks who fits best.

## Technical section — scraping stack (≤ 500 characters)

Apify only: apify/instagram-profile-scraper (bio, links, private flag, 12 latest posts) and harvestapi/linkedin-profile-scraper in no-email mode (bovi/linkedin-profile-scraper as fallback), launched as batched async runs (10 per run, free-plan limits) and polled by a resumable Next.js pipeline on Vercel. Output normalised with zod, emails/phones stripped, images resized with sharp, stored in Supabase. Agents run on Gemini + Groq free tiers via a rate-limited fallback router.

## Links

- YouTube: _to be added after upload_
- Demo link: https://envoy-agentic-dating.vercel.app/pool/demo
- Live website: https://envoy-agentic-dating.vercel.app
- GitHub: https://github.com/gpr-27/envoy-agentic-dating
