/**
 * Text sent to X, shared by the publisher and the Create preview.
 *
 * Order: caption, then link, then hashtags. Blank line between non-empty sections.
 * The caption is the Instagram caption, Pinterest title, and Pinterest description.
 *
 * Length is `twitter-text` `parseTweet` with the library's default v3 config:
 * each transformed URL counts as 23, and Unicode characters use X's weights
 * (most CJK characters and emoji count as 2). The same `xWeightedLength` result
 * is what Create, trimming, the X validator, and the mock publisher enforce.
 */
import twitterText from "twitter-text";

export const X_MAX_WEIGHTED_LENGTH = 280;

/** Current X t.co length for both http and https URLs (`twitter-text` default). */
export const X_TCO_URL_LENGTH = 23;

const SECTION_SEPARATOR = "\n\n";

function tweetConfig(maxWeightedTweetLength: number) {
  return {
    ...twitterText.configs.defaults,
    maxWeightedTweetLength,
  };
}

export type ComposedXPost = {
  text: string;
  weightedLength: number;
  /** True when caption and/or hashtags were shortened so the post stays within the X limit. */
  shortened: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Caption only. Instagram and Facebook still publish this, without the link or hashtags. */
export function composeCaptionText(payload: unknown): string {
  const data = asRecord(payload);
  if (!data) return "";
  return [data.instagramCaption, data.pinterestTitle, data.pinterestDescription]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPublishableHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readBriefUrl(payload: Record<string, unknown>): string {
  const brief = asRecord(payload.brief);
  if (!brief) return "";
  const url = String(brief.url ?? "").trim();
  return isPublishableHttpUrl(url) ? url : "";
}

/** Whitespace-separated tokens. A bare "#" is dropped so a cut never leaves a partial hashtag. */
function hashtagTokens(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter((token) => token !== "#");
}

/** X weighted length via `twitter-text` parseTweet (config v3). */
export function xWeightedLength(text: string): number {
  return twitterText.parseTweet(text, tweetConfig(X_MAX_WEIGHTED_LENGTH)).weightedLength;
}

function joinSections(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(SECTION_SEPARATOR);
}

/**
 * Longest prefix that fits `maxWeight`. `parseTweet` keeps URLs and emoji whole.
 * `validRangeEnd` is an inclusive UTF-16 index. A prefix that still weighs too much
 * (the first character itself does not fit) is dropped.
 */
function trimSectionToWeight(text: string, maxWeight: number): string {
  if (maxWeight <= 0 || !text) return "";
  if (xWeightedLength(text) <= maxWeight) return text;

  const parsed = twitterText.parseTweet(text, tweetConfig(maxWeight));
  const candidate = text.slice(0, parsed.validRangeEnd + 1).trimEnd();
  if (candidate && xWeightedLength(candidate) <= maxWeight) return candidate;
  return "";
}

function captionBudget(link: string, tagText: string): number {
  const rest = joinSections([link, tagText]);
  if (!rest) return X_MAX_WEIGHTED_LENGTH;
  return X_MAX_WEIGHTED_LENGTH - xWeightedLength(SECTION_SEPARATOR) - xWeightedLength(rest);
}

function hashtagsThatFit(link: string, tags: string[]): string[] {
  const kept: string[] = [];
  for (const token of tags) {
    const candidate = [...kept, token].join(" ");
    if (xWeightedLength(joinSections([link, candidate])) <= X_MAX_WEIGHTED_LENGTH) {
      kept.push(token);
    }
  }
  return kept;
}

function fitXPost(caption: string, link: string, tags: string[]): string {
  const safeLink = link && xWeightedLength(link) <= X_MAX_WEIGHTED_LENGTH ? link : "";
  const tagText = hashtagsThatFit(safeLink, tags).join(" ");
  const trimmedCaption = trimSectionToWeight(caption, captionBudget(safeLink, tagText));
  return joinSections([trimmedCaption, safeLink, tagText]);
}

export function composeXPost(payload: unknown): ComposedXPost {
  const data = asRecord(payload);
  const caption = composeCaptionText(payload);
  const link = data ? readBriefUrl(data) : "";
  const tags = hashtagTokens(String(data?.hashtags ?? ""));
  const untrimmed = joinSections([caption, link, tags.join(" ")]);
  const text = fitXPost(caption, link, tags);
  return {
    text,
    weightedLength: xWeightedLength(text),
    shortened: text !== untrimmed,
  };
}

export function composePublishText(payload: unknown): string {
  return composeXPost(payload).text;
}
