import { CreatePromotionForm } from "@/components/create-promotion-form";
import { PageHeader } from "@/components/page-header";
import { getProductById } from "@/lib/mock-data";

type CreatePageProps = {
  searchParams: Promise<{
    productId?: string | string[];
    promotionId?: string | string[];
    sourcePostId?: string | string[];
    mode?: string | string[];
    templateId?: string | string[];
  }>;
};

export default async function CreatePromotionPage({ searchParams }: CreatePageProps) {
  const params = await searchParams;
  const rawProductId = params.productId;
  const id = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;
  const rawPromotionId = params.promotionId;
  const promotionId = Array.isArray(rawPromotionId) ? rawPromotionId[0] : rawPromotionId;
  const rawSourcePostId = params.sourcePostId;
  const sourcePostId = Array.isArray(rawSourcePostId) ? rawSourcePostId[0] : rawSourcePostId;
  const rawMode = params.mode;
  const mode = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  const rawTemplateId = params.templateId;
  const templateId = Array.isArray(rawTemplateId) ? rawTemplateId[0] : rawTemplateId;
  const prefillMode = mode === "reschedule" ? "reschedule" : mode === "duplicate" ? "duplicate" : undefined;
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
        sourcePostId={sourcePostId?.trim() || undefined}
        prefillMode={prefillMode}
        templateId={templateId?.trim() || undefined}
      />
    </>
  );
}
