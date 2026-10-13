/**
 * Deterministic synthetic scrape data for MOCK_EXTERNALS=1 (no network).
 * Output is derived from the slug/handle so the same person always looks the
 * same, while different people get different careers, cities and hobbies.
 * Handles containing "private" → private account; "notfound" → not found.
 */
import type { CanonicalLinks, NormalizedInstagram, NormalizedLinkedIn } from "@/lib/contracts";
import { NormalizedInstagram as IGSchema, NormalizedLinkedIn as LISchema } from "@/lib/contracts";
import { hash32 } from "./util";

/** Actor label stored on mock output. */
export const MOCK_ACTOR = "mock";

type Career = { title: string; company: string; prev: [string, string]; school: string; degree: string; skills: string[]; about: string };

const CAREERS: Career[] = [
  { title: "Senior Product Designer", company: "Lumen Health", prev: ["UX Designer", "Northwind Studio"], school: "Rhode Island School of Design", degree: "BFA, Graphic Design", skills: ["Product Design", "Figma", "Design Systems", "User Research"], about: "I design calm software for anxious moments — patient apps, appointment flows, the small screens people open at 2am. Outside work I sketch buildings and teach a free Saturday drawing class." },
  { title: "Staff Software Engineer", company: "Orbital Data", prev: ["Software Engineer", "Kite Payments"], school: "University of Waterloo", degree: "BASc, Computer Engineering", skills: ["Distributed Systems", "Go", "Kubernetes", "Mentoring"], about: "Backend engineer who likes boring, reliable systems and exciting weekends. I mentor bootcamp grads and maintain a small open-source CLI for trail maps." },
  { title: "Founder & CEO", company: "Sprout Kitchens", prev: ["Operations Lead", "FreshCart"], school: "INSEAD", degree: "MBA", skills: ["Entrepreneurship", "Operations", "Fundraising", "Food Systems"], about: "Building neighbourhood kitchens that turn surplus produce into affordable meals. Previously scaled grocery ops across 6 cities. Big believer in long dinners and short meetings." },
  { title: "Pediatric Physiotherapist", company: "St. Mary's Children's Hospital", prev: ["Physiotherapist", "MoveWell Clinic"], school: "King's College London", degree: "MSc, Physiotherapy", skills: ["Rehabilitation", "Pediatrics", "Sports Injury", "Patient Education"], about: "Helping kids get back to running, climbing and being kids. Weekend marathoner, volunteer coach for a youth football team." },
  { title: "Climate Policy Analyst", company: "Green Futures Institute", prev: ["Research Associate", "Urban Mobility Lab"], school: "London School of Economics", degree: "MSc, Environmental Policy", skills: ["Policy Analysis", "Climate Finance", "Data Visualization", "Public Speaking"], about: "I translate climate science into policy people can actually vote for. Cyclist, amateur gardener, and the friend who always brings a reusable cup." },
  { title: "Head of Marketing", company: "Tidal Audio", prev: ["Brand Manager", "Vinyl & Co."], school: "NYU Stern", degree: "BS, Marketing", skills: ["Brand Strategy", "Content", "Growth", "Storytelling"], about: "Music-obsessed marketer. I've launched headphones, festivals and one very unsuccessful podcast. I DJ small sets on Fridays and collect 70s jazz records." },
  { title: "Data Scientist", company: "Atlas Mobility", prev: ["Analyst", "CityBike"], school: "ETH Zürich", degree: "MSc, Statistics", skills: ["Machine Learning", "Python", "Experimentation", "Causal Inference"], about: "Making cities move better with data. I like hiking above the treeline, baking sourdough, and arguing (kindly) about p-values." },
  { title: "Architect", company: "Studio Nord", prev: ["Junior Architect", "Hale & Partners"], school: "TU Delft", degree: "MSc, Architecture", skills: ["Sustainable Design", "Revit", "Urban Planning", "Timber Construction"], about: "Designing low-carbon homes with lots of daylight. Weekend potter and slow traveller — I take trains wherever I can." },
  { title: "Emergency Medicine Resident", company: "City General Hospital", prev: ["Medical Student", "University Hospital"], school: "Johns Hopkins University", degree: "MD", skills: ["Emergency Medicine", "Critical Care", "Teamwork", "Global Health"], about: "ER resident. I recharge by surfing at dawn and cooking huge pots of soup for my building." },
  { title: "Venture Investor", company: "Northstar Capital", prev: ["Product Manager", "Brightwave"], school: "Stanford University", degree: "BS, Symbolic Systems", skills: ["Venture Capital", "Product Strategy", "Fintech", "Due Diligence"], about: "Early-stage investor backing founders in fintech and climate. Former PM. Chess club regular, salsa beginner, cold-water swimmer." },
];

const CITIES = ["London, England, United Kingdom", "Berlin, Germany", "New York, New York, United States", "Toronto, Ontario, Canada", "Amsterdam, North Holland, Netherlands", "Bengaluru, Karnataka, India", "San Francisco, California, United States", "Lisbon, Portugal", "Melbourne, Victoria, Australia", "Barcelona, Catalonia, Spain"];

type Hobby = { tag: string; captions: string[]; place: string };
const HOBBIES: Hobby[] = [
  { tag: "trailrunning", place: "Peak District", captions: ["22km on the ridge this morning, legs are toast 🏃", "Muddy shoes, happy heart. #trailrunning"] },
  { tag: "climbing", place: "The Arch Climbing Wall", captions: ["Finally sent the purple V5 I've been projecting for a month 🧗", "Chalk on everything. #climbing"] },
  { tag: "cooking", place: "Home", captions: ["Sunday ragu, 4 hours, zero regrets 🍝", "Tried making dumplings from scratch with friends #cooking"] },
  { tag: "photography", place: "Old Town", captions: ["Golden hour in the old town 📷 #filmphotography", "Shot on a 1978 Canon AE-1"] },
  { tag: "surfing", place: "Ericeira", captions: ["Dawn patrol, glassy waves 🌊 #surfing", "Wiped out spectacularly, worth it"] },
  { tag: "pottery", place: "Clay Studio", captions: ["Week 6 of wheel throwing — finally a mug that holds coffee ☕", "Glaze day! #pottery"] },
  { tag: "cycling", place: "Alps", captions: ["120km and 2,000m of climbing 🚴 #cycling", "Coffee stop > the actual ride"] },
  { tag: "jazz", place: "Ronnie Scott's", captions: ["Live jazz on a Tuesday is the best kind of Tuesday 🎷", "Found a first pressing at the market #vinyl"] },
  { tag: "hiking", place: "Dolomites", captions: ["Above the clouds ⛰️ #hiking", "Hut-to-hut trek, day 3, still smiling"] },
  { tag: "books", place: "Daunt Books", captions: ["Current read: The Overstory. Recommendations welcome 📚", "Book club picked a 900-page novel again #books"] },
  { tag: "dogs", place: "Hampstead Heath", captions: ["Meet Biscuit, chief happiness officer 🐶", "Biscuit vs. the pond: Biscuit won #dogsofinstagram"] },
  { tag: "travel", place: "Kyoto", captions: ["Temples at 6am, before the crowds 🇯🇵 #travel", "Night trains are underrated"] },
];

function pick<T>(list: readonly T[], seed: number, offset = 0): T {
  return list[(seed + offset * 7919) % list.length];
}

/** Turns "jane-doe-4a1b2c" / "jane.doe" into "Jane Doe". */
export function nameFromId(id: string): string {
  const words = id
    .replace(/[-_.]+/g, " ")
    .split(" ")
    .filter((w) => w && !/\d/.test(w) && !["private", "notfound", "official", "real", "the"].includes(w));
  const name = words.slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return name || "Alex Morgan";
}

/** Synthetic LinkedIn profile for a link (null for slugs containing "notfound"). */
export function mockLinkedIn(link: CanonicalLinks): NormalizedLinkedIn | null {
  if (link.linkedinSlug.includes("notfound")) return null;
  const seed = hash32(link.linkedinSlug);
  const c = pick(CAREERS, seed);
  const city = pick(CITIES, seed, 1);
  const startYear = 2016 + (seed % 6);
  return LISchema.parse({
    url: link.linkedinUrl,
    fullName: nameFromId(link.linkedinSlug),
    headline: `${c.title} at ${c.company}`,
    about: c.about,
    location: city,
    photoUrl: null,
    followers: 300 + (seed % 9000),
    experience: [
      { title: c.title, company: c.company, dateRange: `${startYear + 3} – Present`, location: city.split(",")[0], description: "" },
      { title: c.prev[0], company: c.prev[1], dateRange: `${startYear} – ${startYear + 3}`, location: city.split(",")[0], description: "" },
    ],
    education: [{ school: c.school, degree: c.degree, dateRange: `${startYear - 4} – ${startYear}` }],
    skills: c.skills,
    languages: seed % 2 ? ["English", "Spanish (Professional working proficiency)"] : ["English", "French (Elementary proficiency)"],
    certifications: [],
    volunteering: seed % 3 === 0 ? ["Mentor (Code Your Future)"] : [],
    honors: [],
    activity: [],
    actor: MOCK_ACTOR,
  });
}

/** Synthetic Instagram profile (private for handles containing "private"; null for "notfound"). */
export function mockInstagram(link: CanonicalLinks): NormalizedInstagram | null {
  const h = link.instagramHandle;
  if (h.includes("notfound")) return null;
  const seed = hash32(h);
  const isPrivate = h.includes("private");
  const hobbies = [pick(HOBBIES, seed), pick(HOBBIES, seed, 1), pick(HOBBIES, seed, 2)].filter((x, i, a) => a.indexOf(x) === i);
  const posts = isPrivate
    ? []
    : Array.from({ length: 9 }, (_, i) => {
        const hb = hobbies[i % hobbies.length];
        const caption = hb.captions[i % hb.captions.length];
        const day = new Date(Date.UTC(2026, 8, 28) - i * 6 * 86_400_000);
        return {
          id: `${seed}${i}`,
          url: `https://www.instagram.com/p/MOCK${(seed + i).toString(36).toUpperCase()}/`,
          type: i % 4 === 3 ? "Sidecar" : "Image",
          caption,
          hashtags: [...caption.matchAll(/#(\w+)/g)].map((m) => m[1]).concat(caption.includes("#") ? [] : [hb.tag]),
          mentions: [],
          location: i % 2 ? hb.place : null,
          timestamp: day.toISOString(),
          likes: 40 + ((seed >>> i) % 400),
          comments: 2 + (i % 17),
          imageUrl: null,
          alt: `Photo about ${hb.tag}`,
        };
      });
  return IGSchema.parse({
    handle: h,
    url: link.instagramUrl,
    fullName: nameFromId(h),
    biography: `${hobbies.map((x) => x.tag).join(" · ")} | ${pick(CITIES, hash32(link.linkedinSlug), 1).split(",")[0]} | coffee first`,
    externalUrls: seed % 2 ? [link.linkedinUrl] : [],
    followers: 200 + (seed % 3000),
    following: 150 + (seed % 700),
    postsCount: isPrivate ? 34 : 60 + (seed % 400),
    isPrivate,
    isVerified: false,
    isBusiness: false,
    category: null,
    profilePicUrl: null,
    posts,
    actor: MOCK_ACTOR,
  });
}

/** Deterministic fake run id. */
export function mockRunId(platform: "li" | "ig", links: CanonicalLinks[]): string {
  const key = links.map((l) => `${l.linkedinSlug}|${l.instagramHandle}`).join(",");
  return `mock-${platform}-${hash32(key).toString(36)}`;
}
