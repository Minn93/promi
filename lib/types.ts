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

export type PromotionStatus = "draft" | "scheduled";

/** Saved or scheduled promotion content tied to a catalog product. */
export type Promotion = {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  channels: string[];
  tone: string;
  angle: string;
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
  /** ISO 8601 date-time when the promotion should go live; null if not scheduled yet. */
  scheduledAt: string | null;
  status: PromotionStatus;
};

