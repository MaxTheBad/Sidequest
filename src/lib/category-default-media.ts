type CategoryFallback = {
  imageUrl: string;
  emoji: string;
  title: string;
  note: string;
  gradient: string;
};

const pexelsImage = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1400`;

export const CATEGORY_FALLBACK_MEDIA: Record<string, CategoryFallback> = {
  Build: {
    imageUrl: pexelsImage(7378),
    emoji: "🛠️",
    title: "Build mode",
    note: "Show the workspace, mockup, or build session.",
    gradient: "linear-gradient(135deg,#dbeafe,#e0e7ff)",
  },
  Learn: {
    imageUrl: pexelsImage(12911169),
    emoji: "📚",
    title: "Study mode",
    note: "A desk, notes, or learning setup works best.",
    gradient: "linear-gradient(135deg,#fef3c7,#fde68a)",
  },
  Career: {
    imageUrl: pexelsImage(6585014),
    emoji: "💼",
    title: "Career mode",
    note: "Use a professional office or interview scene.",
    gradient: "linear-gradient(135deg,#e0f2fe,#bae6fd)",
  },
  "Healthy Lifestyle": {
    imageUrl: pexelsImage(4164759),
    emoji: "💪",
    title: "Healthy lifestyle",
    note: "A workout, run, or wellness shot fits here.",
    gradient: "linear-gradient(135deg,#dcfce7,#ccfbf1)",
  },
  Outdoors: {
    imageUrl: pexelsImage(35633648),
    emoji: "🏔️",
    title: "Outdoors",
    note: "Use a trail, sunrise, or adventure photo.",
    gradient: "linear-gradient(135deg,#d1fae5,#fef3c7)",
  },
  Social: {
    imageUrl: pexelsImage(32598302),
    emoji: "☕",
    title: "Social",
    note: "A meetup, coffee table, or group hang works well.",
    gradient: "linear-gradient(135deg,#fae8ff,#fce7f3)",
  },
  Money: {
    imageUrl: pexelsImage(6694535),
    emoji: "💸",
    title: "Money",
    note: "Budgeting, calculator, or finance desk vibes.",
    gradient: "linear-gradient(135deg,#fef9c3,#fde68a)",
  },
  Creative: {
    imageUrl: pexelsImage(33923174),
    emoji: "✨",
    title: "Creative",
    note: "A camera, writing desk, or editing scene fits.",
    gradient: "linear-gradient(135deg,#ede9fe,#ddd6fe)",
  },
  "Arts & Crafts": {
    imageUrl: pexelsImage(15422321),
    emoji: "🎨",
    title: "Arts & Crafts",
    note: "Use paint, tools, or a hands-on craft shot.",
    gradient: "linear-gradient(135deg,#ffe4e6,#f5d0fe)",
  },
  "Music / Producer": {
    imageUrl: pexelsImage(11715272),
    emoji: "🎧",
    title: "Music session",
    note: "Studio, mixer, headphones, or live setup.",
    gradient: "linear-gradient(135deg,#dbeafe,#e9d5ff)",
  },
  Lifestyle: {
    imageUrl: pexelsImage(12911169),
    emoji: "🗓️",
    title: "Lifestyle reset",
    note: "Planner, routine, or tidy workspace is a good fit.",
    gradient: "linear-gradient(135deg,#f1f5f9,#e2e8f0)",
  },
  Wildcard: {
    imageUrl: pexelsImage(31787444),
    emoji: "🖼️",
    title: "No media yet",
    note: "A neutral photo keeps it from feeling empty.",
    gradient: "linear-gradient(135deg,#e2e8f0,#cbd5e1)",
  },
};

export function getCategoryFallbackMedia(categoryRaw?: string | null): CategoryFallback {
  const category = (categoryRaw || "").toLowerCase();
  if (category.includes("art") || category.includes("craft")) return CATEGORY_FALLBACK_MEDIA["Arts & Crafts"];
  if (category.includes("music") || category.includes("producer") || category.includes("beat")) return CATEGORY_FALLBACK_MEDIA["Music / Producer"];
  if (category.includes("healthy") || category.includes("gym") || category.includes("cardio")) return CATEGORY_FALLBACK_MEDIA["Healthy Lifestyle"];
  if (category.includes("learn") || category.includes("study") || category.includes("course")) return CATEGORY_FALLBACK_MEDIA.Learn;
  if (category.includes("career") || category.includes("job") || category.includes("interview") || category.includes("resume")) return CATEGORY_FALLBACK_MEDIA.Career;
  if (category.includes("outdoor") || category.includes("hike") || category.includes("camp")) return CATEGORY_FALLBACK_MEDIA.Outdoors;
  if (category.includes("social") || category.includes("community") || category.includes("meet")) return CATEGORY_FALLBACK_MEDIA.Social;
  if (category.includes("money") || category.includes("finance") || category.includes("budget")) return CATEGORY_FALLBACK_MEDIA.Money;
  if (category.includes("creative") || category.includes("photo") || category.includes("writing")) return CATEGORY_FALLBACK_MEDIA.Creative;
  if (category.includes("lifestyle") || category.includes("habit") || category.includes("routine")) return CATEGORY_FALLBACK_MEDIA.Lifestyle;
  if (category.includes("build") || category.includes("project") || category.includes("startup") || category.includes("idea")) return CATEGORY_FALLBACK_MEDIA.Build;
  return CATEGORY_FALLBACK_MEDIA.Wildcard;
}
