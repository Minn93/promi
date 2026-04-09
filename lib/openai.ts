import OpenAI from "openai";

export type GeneratePromotionInput = {
  productName: string;
  productDescription: string;
  productPrice: number | string;
  tone: string;
  promotionAngle: string;
  channels: string[];
};

export type GeneratePromotionResult = {
  instagramCaption: string;
  pinterestTitle: string;
  pinterestDescription: string;
  hashtags: string;
};

const SYSTEM_PROMPT = `You help beginner Shopify sellers write short, clear promotion copy for Instagram and Pinterest.

Rules:
- Audience: small shops and first-time sellers. Avoid jargon. Be encouraging and practical.
- Use ONLY the exact product information provided by the user input.
- Do NOT invent any facts, materials, sizes, results, claims, features, shipping details, guarantees, stock levels, or customer quotes.
- Do NOT invent or imply discounts, sales, promo codes, limited-time offers, or urgency unless explicitly provided.
- Do NOT invent or infer price details. Mention the price only if it helps the copy; otherwise omit it.
- Instagram caption: 2–5 short lines, line breaks where natural. Optional 1–2 relevant emojis max. End with a simple call-to-action.
- Pinterest title: catchy, under 100 characters, good for search.
- Pinterest description: 2–4 sentences, helpful keywords, friendly tone.
- Hashtags: one string of 6–12 hashtags, each starting with #, separated by single spaces. No duplicates.

Return ONLY valid JSON with exactly these keys:
{
  "instagramCaption": "string",
  "pinterestTitle": "string",
  "pinterestDescription": "string",
  "hashtags": "string"
}`;

function buildUserMessage(input: GeneratePromotionInput): string {
  const priceLabel =
    typeof input.productPrice === "number"
      ? input.productPrice.toFixed(2)
      : String(input.productPrice).trim();

  return [
    `Product name: ${input.productName}`,
    `Product description: ${input.productDescription}`,
    `Price: ${priceLabel}`,
    `Tone: ${input.tone}`,
    `Promotion angle: ${input.promotionAngle}`,
    `Channels: ${input.channels.join(", ")}`,
  ].join("\n");
}

function parsePromotionJson(raw: unknown): GeneratePromotionResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid JSON shape from model");
  }

  const o = raw as Record<string, unknown>;

  return {
    instagramCaption: String(o.instagramCaption ?? "").trim(),
    pinterestTitle: String(o.pinterestTitle ?? "").trim(),
    pinterestDescription: String(o.pinterestDescription ?? "").trim(),
    hashtags: String(o.hashtags ?? "").trim(),
  };
}

export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;

  if (!key || !key.trim()) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey: key });
}

export async function generatePromotionContent(
  input: GeneratePromotionInput
): Promise<GeneratePromotionResult> {
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    temperature: 0.7,
    max_tokens: 800,
  });

  const text = completion.choices[0]?.message?.content;

  if (!text || !text.trim()) {
    throw new Error("Empty completion from OpenAI");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model returned non-JSON text");
  }

  return parsePromotionJson(parsed);
}