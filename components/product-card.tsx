import Image from "next/image";
import Link from "next/link";
import type { Product, StockStatus } from "@/lib/types";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

/** Subtle status chips — readable without loud colors. */
const STOCK_BADGE: Record<StockStatus, string> = {
  in_stock: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  low_stock: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  out_of_stock: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

export type ProductCardProps = {
  product: Product;
  /** Extra classes on the root card (e.g. `h-full`). */
  className?: string;
  /** Override Promote target; defaults to `/create?productId=…`. */
  promoteHref?: string;
};

export function ProductCard({ product, className, promoteHref }: ProductCardProps) {
  const href =
    promoteHref ?? `/create?productId=${encodeURIComponent(product.id)}`;

  return (
    <article
      className={[
        "promi-card-lift flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition-[box-shadow,transform,border-color] duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-zinc-300 motion-safe:hover:shadow-md motion-safe:hover:shadow-zinc-900/[0.06] dark:border-zinc-800 dark:bg-zinc-950 dark:motion-safe:hover:border-zinc-600 dark:motion-safe:hover:shadow-black/35",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={product.image}
          alt={product.name}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {product.name}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {priceFormatter.format(product.price)}
          </p>
          <span
            className={`inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-medium ${STOCK_BADGE[product.stockStatus]}`}
          >
            {STOCK_LABEL[product.stockStatus]}
          </span>
        </div>
        {product.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {product.tags.map((tag) => (
              <li
                key={tag}
                className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto">
          <Link
            href={href}
            className="promi-press flex w-full items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-[background-color,box-shadow,transform,color] duration-200 ease-out hover:bg-zinc-800 hover:shadow-sm hover:shadow-zinc-900/25 active:scale-[0.98] motion-safe:active:translate-y-px dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:hover:shadow-zinc-900/10 dark:active:bg-zinc-300"
          >
            Promote
          </Link>
        </div>
      </div>
    </article>
  );
}
