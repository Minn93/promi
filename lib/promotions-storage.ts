import type { Promotion } from "./types";

export const PROMOTIONS_STORAGE_KEY = "promi-promotions";

export type PromotionsReadResult = {
  items: Promotion[];
  /** Friendly warning when storage data exists but is unreadable/corrupt. */
  warning?: string;
};

export function readPromotions(): PromotionsReadResult {
  if (typeof window === "undefined") return { items: [] };
  const raw = localStorage.getItem(PROMOTIONS_STORAGE_KEY);
  if (!raw) return { items: [] };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {
        items: [],
        warning:
          "We couldn't read your saved promotions (stored data is not in the expected format).",
      };
    }
    return { items: parsed as Promotion[] };
  } catch {
    return {
      items: [],
      warning: "We couldn't read your saved promotions (stored data looks corrupted).",
    };
  }
}

export function loadPromotions(): Promotion[] {
  return readPromotions().items;
}

export function appendPromotion(promotion: Promotion): void {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const next = [...loadPromotions(), promotion];
  try {
    localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("Could not save promotion to localStorage");
  }
}

export function removePromotionById(id: string): void {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }
  const next = loadPromotions().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("Could not update localStorage");
  }
}
