import Image from "next/image";
import Link from "next/link";
import { HomePromotionsSummary } from "@/components/home-promotions-summary";
import { QuickStartOnboarding } from "@/components/quick-start-onboarding";
import { ReliabilitySummary } from "@/components/reliability-summary";
import { mockProducts } from "@/lib/mock-data";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const SUGGESTED_COUNT = 3;

export default function HomePage() {
  const suggested = mockProducts.slice(0, SUGGESTED_COUNT);

  return (
    <div className="space-y-10">
      <section aria-labelledby="home-hero-heading" className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 md:p-10">
        <h1 id="home-hero-heading" className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-3xl">
          Pick a product. Finish your promotion.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-base">
          Promi helps new sellers turn product ideas into social promotions in one flow. Pick a
          product, generate/edit copy, then save a draft or schedule a post.
        </p>
      </section>

      <HomePromotionsSummary />
      <ReliabilitySummary />
      <QuickStartOnboarding />

      <section aria-labelledby="home-suggested-products-heading">
        <h2 id="home-suggested-products-heading" className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Suggested products to promote
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suggested.map((product) => (
            <li key={product.id}>
              <Link
                href={`/create?productId=${encodeURIComponent(product.id)}`}
                className="promi-card-lift flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-zinc-300 motion-safe:hover:bg-zinc-50 motion-safe:hover:shadow-md motion-safe:hover:shadow-zinc-900/[0.05] dark:border-zinc-800 dark:bg-zinc-950 dark:motion-safe:hover:border-zinc-600 dark:motion-safe:hover:bg-zinc-900 dark:motion-safe:hover:shadow-black/30"
              >
                <div className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {product.name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {usd.format(product.price)} ·{" "}
                    <span className="text-zinc-600 dark:text-zinc-300">Start promotion</span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <Link href="/products" className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300">
            View all products
          </Link>
        </p>
      </section>
    </div>
  );
}
