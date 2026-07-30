export const CATEGORY_FALLBACK_MEDIA = {
  Build: {
    imagePath: "/category-fallbacks/build.jpg",
    emoji: "🛠️",
    title: "Build mode",
    note: "Show the workspace, mockup, or build session.",
    gradient: "linear-gradient(135deg,#0c5063,#66a8b8)",
  },
  Learn: {
    imagePath: "/category-fallbacks/learn.jpg",
    emoji: "📚",
    title: "Study mode",
    note: "A desk, notes, or learning setup works best.",
    gradient: "linear-gradient(135deg,#fef3c7,#fde68a)",
  },
  Career: {
    imagePath: "/category-fallbacks/career.jpg",
    emoji: "💼",
    title: "Career mode",
    note: "Use a professional office or interview scene.",
    gradient: "linear-gradient(135deg,#66a8b8,#9bc8d2)",
  },
  "Healthy Lifestyle": {
    imagePath: "/category-fallbacks/healthy-lifestyle.jpg",
    emoji: "💪",
    title: "Healthy lifestyle",
    note: "A workout, run, or wellness shot fits here.",
    gradient: "linear-gradient(135deg,#dcfce7,#ccfbf1)",
  },
  Outdoors: {
    imagePath: "/category-fallbacks/outdoors.jpg",
    emoji: "🏔️",
    title: "Outdoors",
    note: "Use a trail, sunrise, or adventure photo.",
    gradient: "linear-gradient(135deg,#d1fae5,#fef3c7)",
  },
  Social: {
    imagePath: "/category-fallbacks/social.jpg",
    emoji: "☕",
    title: "Social",
    note: "A meetup, coffee table, or group hang works well.",
    gradient: "linear-gradient(135deg,#fae8ff,#fce7f3)",
  },
  Community: {
    imagePath: "/category-fallbacks/community.jpg",
    emoji: "🤝",
    title: "Community",
    note: "Use a gathering, venue, or local event scene.",
    gradient: "linear-gradient(135deg,#e0f2fe,#fce7f3)",
  },
  Money: {
    imagePath: "/category-fallbacks/money.jpg",
    emoji: "💸",
    title: "Money",
    note: "Budgeting, calculator, or finance desk vibes.",
    gradient: "linear-gradient(135deg,#fef9c3,#fde68a)",
  },
  Creative: {
    imagePath: "/category-fallbacks/creative.jpg",
    emoji: "✨",
    title: "Creative",
    note: "A camera, writing desk, or editing scene fits.",
    gradient: "linear-gradient(135deg,#ede9fe,#ddd6fe)",
  },
  "Arts & Crafts": {
    imagePath: "/category-fallbacks/arts-and-crafts.jpg",
    emoji: "🎨",
    title: "Arts & Crafts",
    note: "Use paint, tools, or a hands-on craft shot.",
    gradient: "linear-gradient(135deg,#ffe4e6,#f5d0fe)",
  },
  "Book club": {
    imagePath: "/category-fallbacks/book-club.jpg",
    emoji: "📖",
    title: "Book club",
    note: "A reading nook, stack of books, or discussion circle fits well.",
    gradient: "linear-gradient(135deg,#fef3c7,#fde68a)",
  },
  Sewing: {
    imagePath: "/category-fallbacks/sewing.jpg",
    emoji: "🧵",
    title: "Sewing",
    note: "Use fabric, thread, scissors, or a workspace shot.",
    gradient: "linear-gradient(135deg,#fee2e2,#fbcfe8)",
  },
  "Music / Producer": {
    imagePath: "/category-fallbacks/music-producer.jpg",
    emoji: "🎧",
    title: "Music session",
    note: "Studio, mixer, headphones, or live setup.",
    gradient: "linear-gradient(135deg,#0c5063,#66a8b8)",
  },
  Fishing: {
    imagePath: "/category-fallbacks/fishing.jpg",
    emoji: "🎣",
    title: "Fishing trip",
    note: "A dock, boat, lake, or shoreline scene works best.",
    gradient: "linear-gradient(135deg,#d1fae5,#bae6fd)",
  },
  Painting: {
    imagePath: "/category-fallbacks/painting.jpg",
    emoji: "🖌️",
    title: "Painting session",
    note: "Use a studio, easel, brush, or fresh canvas shot.",
    gradient: "linear-gradient(135deg,#ffe4e6,#fde68a)",
  },
  Lifestyle: {
    imagePath: "/category-fallbacks/learn.jpg",
    emoji: "🗓️",
    title: "Lifestyle reset",
    note: "Planner, routine, or tidy workspace is a good fit.",
    gradient: "linear-gradient(135deg,#66a8b8,#cbe2e8)",
  },
  Wildcard: {
    imagePath: "/category-fallbacks/wildcard.jpg",
    emoji: "🖼️",
    title: "",
    note: "",
    gradient: "linear-gradient(135deg,#0c5063,#66a8b8)",
  },
} as const;

export function getCategoryFallbackMedia(categoryRaw?: string | null) {
  const category = (categoryRaw || "").toLowerCase();
  if (category.includes("paint") || category.includes("canvas") || category.includes("brush") || category.includes("acrylic")) return CATEGORY_FALLBACK_MEDIA.Painting;
  if (category.includes("art") || category.includes("craft")) return CATEGORY_FALLBACK_MEDIA["Arts & Crafts"];
  if (category.includes("book") || category.includes("read")) return CATEGORY_FALLBACK_MEDIA["Book club"];
  if (category.includes("sew") || category.includes("stitch") || category.includes("fabric") || category.includes("thread")) return CATEGORY_FALLBACK_MEDIA.Sewing;
  if (category.includes("music") || category.includes("producer") || category.includes("beat")) return CATEGORY_FALLBACK_MEDIA["Music / Producer"];
  if (category.includes("fish") || category.includes("angler") || category.includes("bait")) return CATEGORY_FALLBACK_MEDIA.Fishing;
  if (category.includes("healthy") || category.includes("gym") || category.includes("cardio")) return CATEGORY_FALLBACK_MEDIA["Healthy Lifestyle"];
  if (category.includes("learn") || category.includes("study") || category.includes("course")) return CATEGORY_FALLBACK_MEDIA.Learn;
  if (category.includes("career") || category.includes("job") || category.includes("interview") || category.includes("resume")) return CATEGORY_FALLBACK_MEDIA.Career;
  if (category.includes("outdoor") || category.includes("hike") || category.includes("camp")) return CATEGORY_FALLBACK_MEDIA.Outdoors;
  if (category.includes("worship") || category.includes("church") || category.includes("civic") || category.includes("volunteer") || category.includes("service") || category.includes("event") || category.includes("neighborhood") || category.includes("local org") || category.includes("community")) return CATEGORY_FALLBACK_MEDIA.Community;
  if (category.includes("social") || category.includes("meet")) return CATEGORY_FALLBACK_MEDIA.Social;
  if (category.includes("money") || category.includes("finance") || category.includes("budget")) return CATEGORY_FALLBACK_MEDIA.Money;
  if (category.includes("creative") || category.includes("photo") || category.includes("writing")) return CATEGORY_FALLBACK_MEDIA.Creative;
  if (category.includes("lifestyle") || category.includes("habit") || category.includes("routine")) return CATEGORY_FALLBACK_MEDIA.Lifestyle;
  if (category.includes("build") || category.includes("project") || category.includes("startup") || category.includes("idea")) return CATEGORY_FALLBACK_MEDIA.Build;
  return CATEGORY_FALLBACK_MEDIA.Wildcard;
}

export const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
  "Something different: let's explore it",
  "My custom challenge starts now",
  "Open idea lab — bring your wildcards",
] as const;

export const TITLE_SUGGESTIONS_BY_CATEGORY: Record<string, readonly string[]> = {
  sports: [
    "Pick a sports buddy and get reps in",
    "Weekend game plan: play, practice, repeat",
    "Join a casual sports crew this week",
  ],
  "indoor games": [
    "Table time with a regular crew",
    "Casual game night with accountability",
    "Find your next indoor game partner",
  ],
  running: [
    "Morning run partners (3x/week)",
    "Easy pace run crew",
    "5K training accountability",
  ],
  build: ["Build in public: validate your idea this week", "Lock in and ship your MVP in 14 days", "Find a co-builder and execute"],
  learn: ["Lock in for a focused study sprint", "Learn something new with accountability", "Daily learning streak — no zero days"],
  career: ["Lock in on interview prep this weekend", "Resume glow-up + job hunt execution", "LinkedIn outreach sprint with accountability"],
  community: ["Find a community event partner", "Volunteer together this weekend", "Join the neighborhood effort and follow through"],
  creative: ["Build your creative streak this week", "Make progress on your next project", "Creative accountability session"],
  fishing: ["Weekend shoreline session", "Early morning fishing run", "Cast, learn, repeat"],
  lifestyle: ["Reset your routine with a friend", "Build a better weekly rhythm", "Habit check-in and follow-through"],
  "healthy lifestyle": ["Lock in with a gym buddy", "Cardio accountability crew (3x/week)", "Healthy habits reset: sleep, food, movement"],
  outdoors: ["Lock in for a sunrise hike", "Beginner-friendly trail day", "Weekend adventure squad"],
  social: ["Meet new people and actually follow through", "Communication skills practice circle", "Community hang + good vibes only"],
  money: ["Lock in and execute a money plan", "Budget reset sprint for this month", "Side hustle ideas to action"],
  "arts & crafts": ["Saturday painting + coffee session", "DIY craft night with accountability", "Lock in and finish your art piece"],
  painting: ["Studio painting session tonight", "Brush, canvas, repeat", "Weekend plein air painting plan"],
  "book club": ["Monthly book club with real follow-through", "Reading circle + discussion night", "Finish the book and show up"],
  sewing: ["Sewing session with accountability", "Finish that hem, patch, or project", "Creative sewing night with momentum"],
  "music / producer": ["Producer lock-in session tonight", "Beat-making sprint and feedback", "Finish one track this week"],
  wildcard: ["Something different: let's explore it", "My custom challenge starts now", "Open idea lab — bring your wildcards"],
};

export function getCategoryTitleSuggestions(categoryName: string) {
  const normalized = categoryName.trim().toLowerCase();
  const direct = TITLE_SUGGESTIONS_BY_CATEGORY[normalized];
  const matchedKey = Object.keys(TITLE_SUGGESTIONS_BY_CATEGORY).find((key) => normalized.includes(key));
  const pool = direct || (matchedKey ? TITLE_SUGGESTIONS_BY_CATEGORY[matchedKey] : null) || TITLE_SUGGESTIONS_BY_CATEGORY.wildcard;
  return Array.from(new Set(pool as string[])).slice(0, 3);
}
