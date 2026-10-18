import type { InternalPostStatus } from "./post-status";

export type NavItem = {
  label: string;
  href: string;
};

/** How many units you can sell right now — common labels in small-shop dashboards. */
export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type Product = {
  id: string;
  name: string;
  /** Price in shop currency (e.g. USD), before tax. */
  price: number;
  /** Product image URL (e.g. from Shopify CDN or a placeholder). */
  image: string;
  description: string;
  stockStatus: StockStatus;
  tags: string[];
  /** Link to the product on your storefront. */
  productUrl: string;
};

export type PromotionStatus = Extract<InternalPostStatus, "draft" | "scheduled">;

/** Saved or scheduled promotion content for a sample product or a user-entered product/campaign. */
export type Promotion = {
  id: string;
  /** Sample catalog id, or `custom-…` for a user-entered brief. */
  productId: string;
  productName: string;
  /** Promi-uploaded image URL, sample image URL, or empty string when there is no image. Never file data. */
  productImage: string;
  /** Absent on drafts saved before Phase 15.2B; treat those as catalog drafts. */
  source?: "catalog" | "custom";
  productDescription?: string;
  /** Free-text price or offer. */
  productPrice?: string;
  productUrl?: string;
  /** Draft media references (URL strings for now; can include uploaded file URLs later). */
  imageRefs?: string[];
  channels: string[];
  tone: string;
  angle: string;
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
  /** Absent on drafts saved before Phase 15.2F; treat those as X. */
  platform?: "x" | "instagram" | "facebook";
  /**
   * Selected X account. Absent when the draft uses the most recently connected account,
   * or when the platform is Instagram or Facebook.
   */
  accountId?: string;
  /** ISO 8601 date-time when the promotion should go live; null if not scheduled yet. */
  scheduledAt: string | null;
  status: PromotionStatus;
};

