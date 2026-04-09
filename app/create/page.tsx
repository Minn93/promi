import { CreatePromotionForm } from "@/components/create-promotion-form";
import { PageHeader } from "@/components/page-header";
import { getProductById } from "@/lib/mock-data";

type CreatePageProps = {
  searchParams: Promise<{ productId?: string | string[]; promotionId?: string | string[] }>;
};

export default async function CreatePromotionPage({ searchParams }: CreatePageProps) {
  const params = await searchParams;
  const rawProductId = params.productId;
  const id = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;
  const rawPromotionId = params.promotionId;
  const promotionId = Array.isArray(rawPromotionId) ? rawPromotionId[0] : rawPromotionId;
  const matched = id ? getProductById(id) : undefined;
  const product = matched ?? null;
  const invalidProductId = Boolean(id && !matched);

  return (
    <>
      <PageHeader
        title="Create promotion"
        description="Tune channels, tone, and angle—then generate copy for your posts."
      />
      <CreatePromotionForm
        product={product}
        invalidProductId={invalidProductId}
        promotionId={promotionId?.trim() || undefined}
      />
    </>
  );
}
