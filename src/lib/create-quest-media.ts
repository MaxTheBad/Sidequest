import { getCategoryTitleSuggestions } from "@questhat/shared";

export const CREATE_QUEST_BANNER_IMAGES = [
  "/create-quest/categories/outdoors/cover-05.jpg",
  "/create-quest/categories/outdoors/cover-00.jpg",
] as const;

// Native suggestions, kept independent of the older feed title suggestions.
const createTitles: Record<string, string[]> = {
  outdoors: ["Sunset beach walk", "Weekend nature trail", "Park picnic meetup"],
  sports: ["Casual pickup game", "Beginner tennis meetup", "Watch the game together"],
  games: ["Board game night", "Arcade meetup", "Friendly trivia team"],
  "arts & creative": ["Paint and create together", "Photo walk downtown", "Creative project session"],
  money: ["Side-hustle brainstorm", "Budget accountability meetup", "Build a business idea"],
  fitness: ["Morning workout crew", "Beginner run club", "Yoga accountability session"],
  more: ["Try something new", "Community meetup", "Make a plan together"],
};
export function getCreateQuestTitles(category: string) {
  return createTitles[category.trim().toLowerCase()] || getCategoryTitleSuggestions(category);
}
