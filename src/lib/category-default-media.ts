import { CATEGORY_FALLBACK_MEDIA as SHARED_CATEGORY_FALLBACK_MEDIA, getCategoryFallbackMedia as getSharedCategoryFallbackMedia } from "@questhat/shared";

type CategoryFallback = {
  imageUrl: string;
  emoji: string;
  title: string;
  note: string;
  gradient: string;
};

export const CATEGORY_FALLBACK_MEDIA: Record<string, CategoryFallback> = Object.fromEntries(
  Object.entries(SHARED_CATEGORY_FALLBACK_MEDIA).map(([key, value]) => [key, { ...value, imageUrl: value.imagePath }]),
) as Record<string, CategoryFallback>;

export function getCategoryFallbackMedia(categoryRaw?: string | null): CategoryFallback {
  const shared = getSharedCategoryFallbackMedia(categoryRaw);
  return { ...shared, imageUrl: shared.imagePath };
}
