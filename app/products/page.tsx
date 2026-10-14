import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/product-card";
import { mockProducts } from "@/lib/mock-data";

export default function ProductsPage() {
  return (
    <>
      <PageHeader
        title="Products"
        description="Sample catalog — try the Promi workflow with these example products."
      />
      <p className="mb-6 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
        These are sample products for exploring Promi. Choose one and create a post to generate copy,
        save a draft, or schedule publishing. To promote your own product or campaign,{" "}
        <Link href="/create" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
          describe it on Create
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mockProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}
