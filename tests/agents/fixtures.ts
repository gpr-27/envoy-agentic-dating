import { ScrapeBundle, type ProfileAnalysis } from "@/lib/contracts";

interface PersonSpec {
  slug: string;
  name: string;
  igName?: string;
  headline: string;
  location: string;
  about: string;
  experience: { title: string; company: string; description?: string }[];
  skills: string[];
  bio: string;
  links?: string[];
  posts: { caption: string; hashtags?: string[]; location?: string }[];
}

/** Build a normalized ScrapeBundle fixture. */
export function bundle(p: PersonSpec): ScrapeBundle {
  return ScrapeBundle.parse({
    linkedin: {
      url: `https://www.linkedin.com/in/${p.slug}`,
      fullName: p.name,
      headline: p.headline,
      about: p.about,
      location: p.location,
      experience: p.experience.map((e) => ({ ...e, dateRange: "2021 - Present" })),
      education: [{ school: "State University", degree: "BSc", dateRange: "2010 - 2014" }],
      skills: p.skills,
    },
    instagram: {
      handle: p.slug,
      url: `https://www.instagram.com/${p.slug}/`,
      fullName: p.igName ?? p.name,
      biography: p.bio,
      externalUrls: p.links ?? [],
      followers: 800,
      following: 400,
      postsCount: p.posts.length,
      posts: p.posts.map((x, i) => ({
        id: `${p.slug}-p${i + 1}`,
        url: `https://www.instagram.com/p/${p.slug}${i + 1}/`,
        caption: x.caption,
        hashtags: x.hashtags ?? [],
        location: x.location ?? null,
        timestamp: `2026-09-${String(20 - i).padStart(2, "0")}T08:00:00Z`,
      })),
    },
    images: [],
  });
}

export const maya = bundle({
  slug: "maya-chen",
  name: "Maya Chen",
  headline: "Founder @ Trailhead Labs | climate software",
  location: "San Francisco, California",
  about: "Building software that helps cities plan for heat waves. Weekends belong to granite and sourdough.",
  experience: [
    { title: "Founder", company: "Trailhead Labs", description: "Climate risk mapping for city planners." },
    { title: "Product Manager", company: "Google", description: "Maps platform." },
  ],
  skills: ["Product strategy", "Climate tech", "Python"],
  bio: "climbing, carbs & climate | sf",
  links: ["https://www.linkedin.com/in/maya-chen"],
  posts: [
    { caption: "Finally sent the purple V4 at the gym", hashtags: ["climbing", "bouldering"], location: "Mission Cliffs" },
    { caption: "Sourdough attempt #14. Crumb shot below", hashtags: ["sourdough", "baking"] },
    { caption: "6am start at the crag, worth it", hashtags: ["climbing"], location: "Yosemite Valley" },
    { caption: "Team offsite: we mapped heat islands then ate tacos", hashtags: ["climate"] },
    { caption: "Another loaf, another lesson", hashtags: ["baking"] },
    { caption: "Sunrise run along the Embarcadero", hashtags: ["running"], location: "San Francisco" },
  ],
});

export const leo = bundle({
  slug: "leo-park",
  name: "Leo Park",
  headline: "Staff Software Engineer @ Stripe",
  location: "Oakland, California",
  about: "I write payments infrastructure and terrible puns. Learning to climb, slowly.",
  experience: [
    { title: "Staff Software Engineer", company: "Stripe", description: "Payments reliability." },
    { title: "Software Engineer", company: "Dropbox" },
  ],
  skills: ["TypeScript", "Distributed systems", "Mentoring"],
  bio: "bad puns, good coffee, slow climbs",
  links: ["https://www.linkedin.com/in/leo-park"],
  posts: [
    { caption: "First time leading a route haha, legs still shaking", hashtags: ["climbing"], location: "Berkeley Ironworks" },
    { caption: "Espresso dialed in. Finally.", hashtags: ["coffee"] },
    { caption: "Mentoring night with the bootcamp crew", hashtags: ["mentoring"] },
    { caption: "Pour-over for the team", hashtags: ["coffee"] },
  ],
});

export const ana = bundle({
  slug: "ana-ruiz",
  name: "Ana Ruiz",
  headline: "Museum curator & writer",
  location: "Lisbon, Portugal",
  about: "I curate contemporary art and write a newsletter about forgotten painters.",
  experience: [{ title: "Curator", company: "MAAT Museum", description: "Contemporary art exhibitions." }],
  skills: ["Curation", "Writing", "Art history"],
  bio: "paintings, poems, pastel de nata",
  posts: [
    { caption: "New exhibition opening tonight", hashtags: ["art", "museum"], location: "MAAT" },
    { caption: "Reading on the tram again", hashtags: ["books", "reading"] },
    { caption: "Salsa night, terrible but joyful", hashtags: ["dance"] },
  ],
});

export const sam = bundle({
  slug: "sam-okafor",
  name: "Sam Okafor",
  headline: "Marathon coach & physio student",
  location: "London, United Kingdom",
  about: "Coaching runners and studying how bodies move.",
  experience: [{ title: "Running Coach", company: "Parkside Run Club", description: "Coaching beginners to their first marathon." }],
  skills: ["Coaching", "Sports science"],
  bio: "run club every sunday",
  posts: [
    { caption: "Sunday long run with the club, 30k done", hashtags: ["running", "marathon"] },
    { caption: "Trail running in the Peak District", hashtags: ["trailrunning"], location: "Peak District" },
    { caption: "Coffee after the run is the real reason", hashtags: ["coffee"] },
  ],
});

export const kai = bundle({
  slug: "kai-l",
  name: "Kai Lindqvist",
  headline: "Product designer",
  location: "Stockholm, Sweden",
  about: "Designing calm software. Film photographer on weekends.",
  experience: [{ title: "Product Designer", company: "Spotify", description: "Design systems." }],
  skills: ["Figma", "Design systems"],
  bio: "35mm and long walks",
  posts: [
    { caption: "Shot on 35mm, Portra 400", hashtags: ["filmphotography"] },
    { caption: "Gallery afternoon", hashtags: ["art"], location: "Moderna Museet" },
  ],
});

/** Thin data: 0 posts, short LinkedIn. */
export const thin = bundle({
  slug: "quiet-q",
  name: "Quinn Doe",
  headline: "Analyst",
  location: "",
  about: "",
  experience: [],
  skills: [],
  bio: "",
  posts: [],
});

/** Identity mismatch: different names, no link. */
export const mismatch = bundle({
  slug: "zzz-travel",
  name: "Robert Smith",
  igName: "Priya Natarajan",
  headline: "Accountant",
  location: "Chicago, Illinois",
  about: "Numbers person.",
  experience: [{ title: "Accountant", company: "Deloitte" }],
  skills: ["Accounting"],
  bio: "travel diaries",
  posts: [{ caption: "Bali sunsets", hashtags: ["travel"], location: "Bali" }],
});

export const ALL = { maya, leo, ana, sam, kai };

/** Minimal valid ProfileAnalysis for pure-function tests. */
export function analysis(name: string, opts: { hobbies?: string[]; interests?: string[]; values?: string[]; needs?: string[]; dealbreakers?: string[]; personality?: string[] } = {}): ProfileAnalysis {
  const ev = [{ source: "linkedin" as const, ref: "headline", quote: name, url: null }];
  const trait = (label: string) => ({ label, detail: `${label} detail`, evidence: ev, confidence: "medium" as const });
  return {
    displayName: name,
    tagline: `${name} tagline`,
    summary: `${name} summary`,
    location: "",
    needs: (opts.needs ?? ["Someone kind"]).map(trait),
    hobbies: (opts.hobbies ?? ["Reading"]).map(trait),
    interests: (opts.interests ?? ["Design"]).map(trait),
    otherQualities: [
      ...(opts.values ?? ["Honesty"]).map((l) => ({ ...trait(l), category: "values" as const })),
      ...(opts.personality ?? []).map((l) => ({ ...trait(l), category: "personality" as const })),
    ],
    greenFlags: [],
    possibleDealbreakers: opts.dealbreakers ?? [],
    conversationHooks: [],
    idealFirstDate: "",
    identity: { samePerson: "likely", reasons: [] },
    confidence: "medium",
  };
}
