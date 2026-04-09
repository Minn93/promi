import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/product-card";
import { mockProducts } from "@/lib/mock-data";

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Products" description="Manage the items you promote." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {mockProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}
