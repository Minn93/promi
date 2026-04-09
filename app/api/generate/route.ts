import { NextResponse } from "next/server";
import {
  generatePromotionContent,
  type GeneratePromotionInput,
  type GeneratePromotionResult,
} from "@/lib/openai";

export type GeneratePromotionRequest = {
  productName: string;
  productDescription: string;
  productPrice: number | string;
  tone: string;
  promotionAngle: string;
  selectedChannels: string[];
};

export type GeneratePromotionResponse = GeneratePromotionResult;

function parseBody(raw: unknown): GeneratePromotionRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const productName = o.productName;
  const productDescription = o.productDescription;
  const productPrice = o.productPrice;
  const tone = o.tone;
  const promotionAngle = o.promotionAngle;
  const selectedChannels = o.selectedChannels;

  if (typeof productName !== "string" || !productName.trim()) return null;
  if (typeof productDescription !== "string") return null;
  if (typeof tone !== "string" || !tone.trim()) return null;
  if (typeof promotionAngle !== "string" || !promotionAngle.trim()) return null;
  if (typeof productPrice !== "number" && typeof productPrice !== "string") {
    return null;
  }
  if (!Array.isArray(selectedChannels) || selectedChannels.length === 0) {
    return null;
  }
  if (!selectedChannels.every((c) => typeof c === "string" && c.trim())) {
    return null;
  }

  return {
    productName: productName.trim(),
    productDescription: productDescription.trim(),
    productPrice,
    tone: tone.trim(),
    promotionAngle: promotionAngle.trim(),
    selectedChannels: selectedChannels.map((c) => c.trim().toLowerCase()),
  };
}

function toHelperInput(req: GeneratePromotionRequest): GeneratePromotionInput {
  return {
    productName: req.productName,
    productDescription: req.productDescription,
    productPrice: req.productPrice,
    tone: req.tone,
    promotionAngle: req.promotionAngle,
    channels: req.selectedChannels,
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseBody(body);

  if (!input) {
    return NextResponse.json(
      {
        error:
          "Invalid request. Required: productName, productDescription, productPrice, tone, promotionAngle, selectedChannels (non-empty string array).",
      },
      { status: 400 }
    );
  }

  try {
    console.log("OPENAI KEY EXISTS:", !!process.env.OPENAI_API_KEY);

    const result = await generatePromotionContent(toHelperInput(input));

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/generate]", err);

    return NextResponse.json(
      {
        error: "Generation failed. Please try again.",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}