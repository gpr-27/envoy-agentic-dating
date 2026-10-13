/** Keyword lexicons for the offline mock (hobbies, interests, venues). */

export interface HobbyDef {
  label: string;
  re: RegExp;
  need: string;
  venue: string;
  activity: string;
  moment: string;
}

export const HOBBIES: HobbyDef[] = [
  { label: "Climbing", re: /climb|boulder|crag/i, need: "Someone who'll spot them on a project and not rush the send", venue: "a bouldering gym", activity: "Bouldering the beginner wall, then tacos next door", moment: "*chalks up and misses the first hold completely*" },
  { label: "Trail running", re: /\brun\b|running|marathon|trail|ultra|5k|10k/i, need: "A partner who's fine with early alarms on race weekends", venue: "a riverside running path", activity: "An easy sunrise jog, then pastries at the finish", moment: "*retying a shoelace at the halfway bench*" },
  { label: "Hiking", re: /hike|hiking|trek|summit|mountain/i, need: "Someone who'll trade a lie-in for a view", venue: "a short ridge trail", activity: "A two-hour hike to the lookout, then sandwiches at the top", moment: "*pausing at the lookout to catch breath*" },
  { label: "Cooking & baking", re: /cook|recipe|bake|baking|sourdough|kitchen|pasta|chef/i, need: "Someone who treats dinner as an event, not a chore", venue: "a hands-on cooking class", activity: "A pasta-making class, then eating the results", moment: "*flour everywhere, a ravioli that looks like a dumpling*" },
  { label: "Coffee", re: /coffee|espresso|latte|cafe|café/i, need: "A partner who has opinions about a good cortado", venue: "a specialty coffee roastery", activity: "A cupping session, then a walk with cortados", moment: "*the barista slides over a tasting flight*" },
  { label: "Photography", re: /photo|35mm|film camera|shot on|lens/i, need: "Someone patient while they wait for the light", venue: "a photo walk through the old town", activity: "A golden-hour photo walk, then a bar with good light", moment: "*stops mid-sentence to frame a doorway*" },
  { label: "Travel", re: /travel|trip|abroad|passport|airport|flight|wander/i, need: "A partner who'll say yes to a last-minute train ticket", venue: "a night market", activity: "Grazing a night market stall by stall", moment: "*splitting a skewer that is mostly chili*" },
  { label: "Music", re: /music|guitar|piano|concert|gig|vinyl|dj|band|festival/i, need: "Someone who'll come to the small gigs, not just the big ones", venue: "a record shop with a listening bar", activity: "Digging through records, then a set at the listening bar", moment: "*holds up a sleeve with an absurd album cover*" },
  { label: "Reading", re: /book|reading|novel|library|poetry/i, need: "A partner who's comfortable with a quiet Sunday of reading side by side", venue: "an independent bookshop café", activity: "Picking a book for each other, then coffee to defend the picks", moment: "*pulls a battered paperback off the staff-picks shelf*" },
  { label: "Art & museums", re: /\bart\b|gallery|museum|painting|exhibit|sketch/i, need: "Someone who'll linger at a painting longer than the audio guide", venue: "a modern art museum", activity: "A slow lap of the new exhibition, then the rooftop café", moment: "*squints at a canvas that is entirely blue*" },
  { label: "Cycling", re: /cycl|bike|biking|velo|peloton/i, need: "A partner who's fine with a bakery stop as the real destination", venue: "a waterfront bike path", activity: "A lazy bike-share ride to a bakery and back", moment: "*rings the bell at a pigeon that refuses to move*" },
  { label: "Yoga", re: /yoga|pilates|meditat|mindful/i, need: "Someone who values slow mornings as much as busy days", venue: "a sunrise yoga class in the park", activity: "Sunrise yoga, then a smoothie bar", moment: "*wobbling in tree pose next to a very calm dog*" },
  { label: "Surfing & swimming", re: /surf|swim|ocean|beach|dive|snorkel/i, need: "A partner who doesn't mind sand in the car", venue: "a beach with a surf school", activity: "A beginner surf lesson, then fish tacos on the sand", moment: "*wiping out on a wave the size of a bathtub*" },
  { label: "Dogs", re: /\bdog\b|puppy|pup\b|doggo/i, need: "Someone who'll love the dog first", venue: "a dog-friendly park café", activity: "A long walk through the park, then coffee on the dog-friendly terrace", moment: "*a passing spaniel steals the spotlight*" },
  { label: "Racket sports", re: /tennis|padel|squash|badminton|pickleball/i, need: "A partner who can lose a set gracefully", venue: "public padel courts", activity: "A friendly padel match, then lemonade courtside", moment: "*serves straight into the net, twice*" },
  { label: "Gaming & puzzles", re: /gaming|video game|chess|puzzle|board game|crossword/i, need: "Someone who enjoys a little competitive banter", venue: "a board-game café", activity: "Three rounds of a strategy game, then dumplings", moment: "*knocks over the tower of pieces at the worst moment*" },
  { label: "Dancing", re: /dance|salsa|bachata|tango|swing/i, need: "A partner who'll get on the dance floor badly but gladly", venue: "a salsa night with a beginner class", activity: "The beginner lesson, then staying for the social dance", moment: "*steps on a toe and apologises in rhythm*" },
  { label: "Gardening", re: /garden|plants?\b|botanic|allotment/i, need: "Someone patient with slow-growing things", venue: "the botanical gardens", activity: "A wander through the glasshouses, then tea", moment: "*reading a plant label out loud with great drama*" },
  { label: "Writing", re: /writing|essay|newsletter|blog|substack|journal/i, need: "A partner who'll read the draft and be honest about it", venue: "a quiet wine bar with notebooks on the tables", activity: "Swapping favourite lines over a glass of wine", moment: "*doodling on a napkin to make a point*" },
];

export interface InterestDef {
  label: string;
  re: RegExp;
}

export const INTERESTS: InterestDef[] = [
  { label: "AI & machine learning", re: /\bai\b|machine learning|\bml\b|llm|deep learning|artificial intelligence/i },
  { label: "Startups", re: /founder|startup|co-founder|venture|seed|y combinator|entrepreneur/i },
  { label: "Product & design", re: /product|design|ux|ui\b|figma/i },
  { label: "Software engineering", re: /engineer|developer|software|typescript|python|backend|frontend/i },
  { label: "Finance & investing", re: /financ|invest|fintech|banking|trading|vc\b/i },
  { label: "Climate & sustainability", re: /climate|sustainab|renewable|solar|carbon|energy/i },
  { label: "Education", re: /educat|teach|learning|school|mentor/i },
  { label: "Marketing & storytelling", re: /marketing|brand|content|storytell|growth/i },
  { label: "Research & science", re: /research|scien|phd|lab\b|biolog|physic/i },
  { label: "Media & creativity", re: /media|film|video|creator|podcast|journalis/i },
  { label: "Community building", re: /community|volunteer|nonprofit|non-profit|mentor|ngo/i },
  { label: "Health & fitness industry", re: /fitness|wellness|coach|athlet|sport/i },
];

/** Quality cues: [regex over all text, category, label, detail]. */
export const QUALITY_CUES: [RegExp, string, string, string][] = [
  [/founder|ceo|head of|director|lead|manager|vp\b/i, "ambition", "Builder energy", "Has taken on ownership roles rather than waiting to be handed them."],
  [/volunteer|mentor|nonprofit|community|teach/i, "values", "Shows up for others", "Gives time to mentoring or community work."],
  [/haha|lol|😂|joke|pun|\?!|!{2,}/i, "humour", "Caption comedian", "Captions lean playful and self-deprecating."],
  [/sunrise|morning|5am|6am|early/i, "lifestyle", "Early riser", "Posts and plans tend to start before most people's alarms."],
  [/travel|abroad|trip|airport/i, "lifestyle", "Itchy feet", "Posts from several places; seems to plan life around getting away."],
  [/team|together|crew|friends|family/i, "personality", "Crew-oriented", "Credits and tags the people around them."],
  [/film|35mm|palette|aesthetic|design|minimal/i, "aesthetic", "Eye for detail", "Carefully framed, consistent visual style."],
];
