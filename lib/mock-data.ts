import type { NavItem, Product } from "./types";

/** Sidebar links — edit here to change menu order or labels. */
export const dashboardNavItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Create Promotion", href: "/create" },
  { label: "Scheduled", href: "/scheduled" },
  { label: "Performance", href: "/performance" },
];

/**
 * Sample catalog for a beginner Shopify-style seller (handmade / small batch).
 * Replace with API data when you connect a real store.
 */
export const mockProducts: Product[] = [
  {
    id: "prod_1001",
    name: "Linen Tote Bag — Natural",
    price: 34.0,
    image: "/images/linen-tote-bag1.jpg",
    description:
      "Lightweight everyday tote in undyed linen. Fits a laptop, water bottle, and daily essentials.",
    stockStatus: "in_stock",
    tags: ["accessories", "linen", "eco-friendly", "bestseller"],
    productUrl: "https://promi-demo.myshopify.com/products/linen-tote-natural",
  },
  {
    id: "prod_1002",
    name: "Soy Candle — Lavender & Cedar",
    price: 22.5,
    image: "/images/soy-candle1.jpg",
    description:
      "Hand-poured 8 oz candle with a calm woodsy scent. Burn time approx. 45 hours.",
    stockStatus: "low_stock",
    tags: ["home", "candles", "handmade", "gift"],
    productUrl: "https://promi-demo.myshopify.com/products/soy-candle-lavender-cedar",
  },
  {
    id: "prod_1003",
    name: "Ceramic Mug — Speckled Clay",
    price: 28.0,
    image: "/images/ceramic-mug1.jpg",
    description:
      "Microwave- and dishwasher-safe mug, glazed in a soft speckled finish. Holds 12 oz.",
    stockStatus: "in_stock",
    tags: ["kitchen", "ceramic", "handmade"],
    productUrl: "https://promi-demo.myshopify.com/products/ceramic-mug-speckled",
  },
  {
    id: "prod_1004",
    name: "Organic Cotton Tee — Cream",
    price: 32.0,
    image: "/images/organic-cotton-tee1.jpg",
    description:
      "Relaxed unisex fit, GOTS-certified cotton. Pre-shrunk; size chart in product photos.",
    stockStatus: "in_stock",
    tags: ["apparel", "organic", "unisex", "basics"],
    productUrl: "https://promi-demo.myshopify.com/products/organic-cotton-tee-cream",
  },
  {
    id: "prod_1005",
    name: "Sticker Pack — Studio Doodles (5 pc)",
    price: 9.99,
    image: "/images/sticker-pack2.jpg",
    description:
      "Waterproof vinyl stickers from our original illustrations. Great for laptops and planners.",
    stockStatus: "out_of_stock",
    tags: ["stationery", "stickers", "gift-under-15"],
    productUrl: "https://promi-demo.myshopify.com/products/sticker-pack-studio-doodles",
  },
  {
    id: "prod_1006",
    name: "A5 Dot Grid Notebook",
    price: 16.5,
    image: "/images/A5-Dot-Grid-Notebook.jpg",
    description:
      "120 gsm paper, lay-flat binding, soft-touch cover. Ideal for bullet journaling.",
    stockStatus: "in_stock",
    tags: ["stationery", "notebook", "planning"],
    productUrl: "https://promi-demo.myshopify.com/products/a5-dot-grid-notebook",
  },
];

export function getProductById(id: string): Product | undefined {
  return mockProducts.find((p) => p.id === id);
}
