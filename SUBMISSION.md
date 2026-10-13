# Submission texts

## Overall explanation (≤ 200 characters)

Envoy: paste a LinkedIn + public Instagram. An AI agent reads the person, writes an evidence-backed profile, goes on real turn-by-turn dates with the other agents for them, then ranks who fits best.

## Technical section — scraping stack (≤ 500 characters)

Apify. Instagram: apify/instagram-profile-scraper (public bio, links, follower counts, private-account flag, latest 12 posts with captions, hashtags, locations, images). LinkedIn: harvestapi/linkedin-profile-scraper in no-cookie, no-email mode (headline, about, experience, education, skills), with bovi/linkedin-profile-scraper as fallback. Run from Next.js API routes on Vercel via apify-client as batched async runs, polled until done. Private Instagram accounts are rejected.

## Links

- YouTube: _to be added after upload_
- Demo link: https://envoy-agentic-dating.vercel.app/pool/demo
- Live website: https://envoy-agentic-dating.vercel.app
- GitHub: https://github.com/gpr-27/envoy-agentic-dating
