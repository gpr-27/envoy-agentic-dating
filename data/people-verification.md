# People verification evidence

Checked on 2026-10-13.

## Method
- **LinkedIn + Instagram link check:** For each high-confidence person, I fetched the official personal or company website (the URL given under "Source"). I pulled the `linkedin.com/in/<slug>` and `instagram.com/<handle>` links out of that page's HTML. Every slug and handle below was copied from those pages, except Marina Mogilko's LinkedIn slug, which came from a search result. None were guessed.
- **Instagram existence check:** I fetched each Instagram profile's public Open Graph metadata (`og:description`). This returned the display name plus the follower and post counts, which confirms the account exists and matches the person's name. The counts below are from 2026-10-13.
- **Public vs private:** Instagram would not let me see whether an account is private without logging in (the API asked for a login). Each account below is a creator or brand account that the person links from their own website, and each has hundreds to thousands of posts. That makes it very likely they are public, but it is not directly confirmed.
- **LinkedIn pages:** I did not fetch these, because LinkedIn blocks it. Each slug comes from a link on the person's own website, so it is the profile they point people to.

## High confidence (the person's own website links both profiles)

| # | Name | Source (links both) | LinkedIn | Instagram (OG metadata on 2026-10-13) |
|---|------|---------------------|----------|----------------------------------|
| 1 | Jeff Su | https://www.jeffsu.org | https://www.linkedin.com/in/jsu05 | https://www.instagram.com/j.sushie/ - "Jeff Su (@j.sushie)", 85K followers, 292 posts |
| 2 | Sahil Bloom | https://www.sahilbloom.com | https://www.linkedin.com/in/sahilbloom | https://www.instagram.com/sahilbloom/ - "Sahil Bloom", 1M followers, 1,375 posts |
| 3 | Codie Sanchez | https://www.contrarianthinking.co (her company) | https://www.linkedin.com/in/codiesanchez | https://www.instagram.com/codiesanchez/ - "Codie Sanchez", 3M followers, 2,548 posts. A web search also returned the same LinkedIn URL from two independent sources. |
| 4 | Justin Welsh | https://www.justinwelsh.me | https://www.linkedin.com/in/justinwelsh | https://www.instagram.com/thejustinwelsh/ - "Justin Welsh", 97K followers, 1,468 posts |
| 5 | Chris Do | https://thefutur.com (his company) | https://www.linkedin.com/in/thechrisdo | https://www.instagram.com/thechrisdo/ - "Chris Do - Personal Branding/Sales Coach", 1M followers, 1,779 posts |
| 6 | Ankur Warikoo | https://ankurwarikoo.com | https://www.linkedin.com/in/warikoo | https://www.instagram.com/ankurwarikoo/ - "Ankur Warikoo", 4M followers, 6,622 posts |
| 7 | Vanessa Van Edwards | https://www.scienceofpeople.com (her company) | https://www.linkedin.com/in/vanessavanedwards | https://www.instagram.com/vvanedwards/ - "Vanessa Van Edwards", 1M followers, 4,518 posts |
| 8 | Hala Taha | https://youngandprofiting.com (her podcast/company) | https://www.linkedin.com/in/htaha | https://www.instagram.com/yapwithhala/ - "Hala Taha", 189K followers, 936 posts |
| 9 | Kara Goldin | https://www.karagoldin.com | https://www.linkedin.com/in/karagoldin | https://www.instagram.com/karagoldin/ - "Kara Goldin", 828K followers, 4,683 posts |
| 10 | Dan Martell | https://www.danmartell.com | https://www.linkedin.com/in/dmartell | https://www.instagram.com/danmartell/ - "Dan Martell", 3M followers, 3,988 posts |
| 11 | Jay Clouse | https://jayclouse.com | https://www.linkedin.com/in/jayclouse | https://www.instagram.com/jayclouse/ - "Jay Clouse", 13K followers, 2,599 posts |
| 12 | Morgan DeBaun | https://www.morgandebaun.com | https://www.linkedin.com/in/morgandebaun | https://www.instagram.com/morgandebaun/ - "Morgan DeBaun", 195K followers, 587 posts |
| 13 | Michelle Poler | https://michellepoler.com | https://www.linkedin.com/in/michellepoler | https://www.instagram.com/hellofears/ - "Michelle Poler - Keynote Speaker", 146K followers, 1,485 posts. Her site links @hellofears. She also has a larger account, @michellepoler (258K followers, Spanish-language "Creetelo" brand), but her site does not link it, so I did not use it. |
| 14 | Mo Gawdat | https://www.mogawdat.com | https://www.linkedin.com/in/mogawdat | https://www.instagram.com/mo_gawdat/ - "Mo Gawdat", 437K followers, 2,117 posts |
| 15 | Simon Squibb | https://www.simonsquibb.com | https://www.linkedin.com/in/simonsquibb | https://www.instagram.com/simonsquibb/ - "Simon Squibb", 7M followers, 6,449 posts |
| 16 | Vusi Thembekwayo | https://www.vusithembekwayo.com | https://www.linkedin.com/in/vusithembekwayo | https://www.instagram.com/vusithembekwayo/ - "Vusi Thembekwayo", 2M followers, 1,072 posts |
| 17 | Emma Isaacs | https://www.emmaisaacs.com | https://www.linkedin.com/in/emma-isaacs | https://www.instagram.com/emmaisaacs/ - "Emma Isaacs", 53K followers, 1,438 posts |
| 18 | Verena Pausder | https://verena-pausder.de | https://www.linkedin.com/in/verenapausder | https://www.instagram.com/verenapausder/ - "Verena Pausder", 75K followers, 549 posts |
| 19 | Jess Ekstrom | https://www.jessekstrom.com | https://www.linkedin.com/in/jess-ekstrom-59160342 | https://www.instagram.com/jess_ekstrom/ - "Jess Ekstrom", 61K followers, 3,093 posts |
| 20 | Jordan Harbinger | https://www.jordanharbinger.com | https://www.linkedin.com/in/jordanharbinger | https://www.instagram.com/jordanharbinger/ - "Jordan Harbinger", 992K followers, 239 posts |
| 21 | Nicolas Cole | https://www.nicolascole.com | https://www.linkedin.com/in/nicolascole | https://www.instagram.com/nicolascole77/ - "Nicolas Cole", 97K followers, 3,522 posts |
| 22 | Matt Gray | https://www.mattgray.com | https://www.linkedin.com/in/mattgray1 | https://www.instagram.com/matthgray/ - "Matt Gray", 973K followers, 2,945 posts |
| 23 | Mariana Atencio | https://www.marianaatencio.com | https://www.linkedin.com/in/marianaatencio | https://www.instagram.com/marianaatencio/ - "MARIANA - Communication Coach", 736K followers, 2,320 posts |
| 24 | Dorie Clark | https://dorieclark.com | https://www.linkedin.com/in/doriec | https://www.instagram.com/dorieclark/ - "Dorie Clark - Personal Branding, Communication, Leadership", 519K followers, 2,241 posts |
| 25 | Anne-Laure Le Cunff | https://nesslabs.com/about (her company) | https://www.linkedin.com/in/alecunff | https://www.instagram.com/neuranne/ - "Anne-Laure Le Cunff, Ph.D.", 83K followers, 232 posts |
| 26 | Tiffany Dufu | https://tiffanydufu.com | https://www.linkedin.com/in/tiffany-dufu-582089a | https://www.instagram.com/tdufu/ - "Tiffany Dufu", 14K followers, 252 posts |
| 27 | Minda Harts | https://www.mindaharts.com | https://www.linkedin.com/in/mindaharts | https://www.instagram.com/mindaharts/ - "Minda", 89K followers, 187 posts |
| 28 | Nathalie Molina Niño | https://www.nathaliemolina.com | https://www.linkedin.com/in/nathaliemolina | https://www.instagram.com/nathaliemolinanino/ - "Nathalie Molina Niño - Author, Investor, Builder", 11K followers, 6,424 posts |

## Medium confidence

| # | Name | Evidence | LinkedIn | Instagram |
|---|------|----------|----------|-----------|
| 29 | Marina Mogilko | The LinkedIn URL came back as a web search result titled "Marina Mogilko". According to the search tool's summary of that result, the profile lists her "Silicon Valley Girl" Instagram (about 1.2M followers) and her Linguamarina/Silicon Valley Girl brands. I could not fetch LinkedIn to read this myself. The Instagram account's display name is "Marina Mogilko". | https://www.linkedin.com/in/marinamogilko | https://www.instagram.com/siliconvalleygirl/ - "Marina Mogilko", 1M followers, 2,732 posts |
| 30 | Tiago Forte | https://fortelabs.com/about links both his LinkedIn and @fortelabsco. That Instagram is his company/brand account, but its display name is "Tiago Forte". His small personal account, @tiagoforte (522 followers), is not linked from his site, so I did not use it. | https://www.linkedin.com/in/tiagoforte | https://www.instagram.com/fortelabsco/ - "Tiago Forte", 15K followers, 1,327 posts |

## Candidates I left out
- **Reshma Saujani:** her site links both profiles, but she was formerly a political candidate.
- **Shaan Puri:** his site links his LinkedIn and @shaanvpuri, but I could not load that Instagram account.
- **Daniel Priestley:** his site links a company Instagram (@dentglobal), not a personal one.
- **Bozoma Saint John:** she leans toward celebrity and reality TV.
- **Amanda Natividad, Sophia Amoruso, Jasmine Star and Tara Mohr:** their sites link both profiles. I left them out only to keep the gender balance and the list at 30, so any of them can replace a row if needed.
- **Dickie Bush and Steph Smith:** I found no personal Instagram linked.
- **Ghazal Alagh, Vineeta Singh, Shradha Khapra and Radhika Gupta:** I could not find a LinkedIn slug in any search result or linking page.
