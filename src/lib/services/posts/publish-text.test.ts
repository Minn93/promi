import assert from "node:assert/strict";
import { describe, it } from "node:test";
import twitterText from "twitter-text";
import {
  X_MAX_WEIGHTED_LENGTH,
  X_TCO_URL_LENGTH,
  composePublishText,
  composeXPost,
  xWeightedLength,
} from "./publish-text";

const SHORT_URL = "https://x.com";
const LONG_URL = `https://example.com/${"product-path-".repeat(40)}item`;

describe("xWeightedLength", () => {
  it("uses twitter-text v3 transformed URL length", () => {
    assert.equal(twitterText.configs.defaults.version, 3);
    assert.equal(twitterText.configs.defaults.transformedURLLength, X_TCO_URL_LENGTH);
    assert.equal(twitterText.configs.defaults.maxWeightedTweetLength, X_MAX_WEIGHTED_LENGTH);
  });

  it("counts plain ASCII as one each", () => {
    assert.equal(xWeightedLength("hello"), 5);
    assert.equal(xWeightedLength("a".repeat(280)), 280);
    assert.equal(xWeightedLength("a".repeat(281)), 281);
  });

  it("counts Korean syllables as two", () => {
    assert.equal(xWeightedLength("안녕"), 4);
    assert.equal(xWeightedLength("가".repeat(140)), 280);
    assert.equal(xWeightedLength("가".repeat(141)), 282);
  });

  it("counts Japanese and other CJK characters as two", () => {
    assert.equal(xWeightedLength("こんにちは"), 10);
    assert.equal(xWeightedLength("漢字"), 4);
    assert.equal(xWeightedLength("Hello 안녕"), 10);
  });

  it("counts an emoji as two, including a ZWJ sequence", () => {
    assert.equal(xWeightedLength("😀"), 2);
    assert.equal(xWeightedLength("hi 😀"), 5);
    assert.equal(xWeightedLength("👨‍👩‍👧‍👦"), 2);
    assert.equal(xWeightedLength("😀".repeat(140)), 280);
    assert.equal(xWeightedLength("😀".repeat(141)), 282);
  });

  it("counts a short URL as the transformed length, not its raw length", () => {
    assert.ok(SHORT_URL.length < X_TCO_URL_LENGTH);
    assert.equal(xWeightedLength(SHORT_URL), X_TCO_URL_LENGTH);
    assert.equal(xWeightedLength(`See ${SHORT_URL}`), 4 + X_TCO_URL_LENGTH);
  });

  it("counts a very long URL as the transformed length", () => {
    assert.ok(LONG_URL.length > X_MAX_WEIGHTED_LENGTH);
    assert.equal(xWeightedLength(LONG_URL), X_TCO_URL_LENGTH);
  });
});

describe("composeXPost", () => {
  it("keeps caption, link, and hashtags in that order", () => {
    const url = "https://shop.example/item";
    const post = composeXPost({
      instagramCaption: "Handmade mug.",
      pinterestTitle: "Stoneware",
      pinterestDescription: "New arrival.",
      hashtags: "#handmade #mug",
      brief: { url },
    });
    assert.equal(
      post.text,
      ["Handmade mug. Stoneware New arrival.", url, "#handmade #mug"].join("\n\n"),
    );
    assert.equal(post.weightedLength, xWeightedLength(post.text));
    assert.equal(post.shortened, false);
    assert.equal(composePublishText({
      instagramCaption: "Handmade mug.",
      pinterestTitle: "Stoneware",
      pinterestDescription: "New arrival.",
      hashtags: "#handmade #mug",
      brief: { url },
    }), post.text);
  });

  it("trims an ASCII caption at the 280 boundary and keeps the link and hashtags whole", () => {
    const url = LONG_URL;
    const post = composeXPost({
      instagramCaption: "a".repeat(300),
      hashtags: "#sale",
      brief: { url },
    });
    assert.ok(post.weightedLength <= X_MAX_WEIGHTED_LENGTH);
    assert.equal(post.weightedLength, xWeightedLength(post.text));
    assert.equal(post.shortened, true);
    const [caption, link, tags] = post.text.split("\n\n");
    assert.equal(link, url);
    assert.equal(tags, "#sale");
    assert.equal(caption, "a".repeat(280 - xWeightedLength(`\n\n${url}\n\n#sale`)));
    assert.equal(post.weightedLength, X_MAX_WEIGHTED_LENGTH);
  });

  it("trims Korean text on a syllable boundary so the weighted length stays within 280", () => {
    const over = composeXPost({ instagramCaption: "가".repeat(141) });
    assert.equal(over.text, "가".repeat(140));
    assert.equal(over.weightedLength, 280);
    assert.equal(over.shortened, true);

    const url = SHORT_URL;
    const post = composeXPost({
      instagramCaption: "가".repeat(200),
      hashtags: "#한글",
      brief: { url },
    });
    assert.ok(post.weightedLength <= X_MAX_WEIGHTED_LENGTH);
    assert.equal(post.text.split("\n\n")[1], url);
    assert.equal(post.text.split("\n\n")[2], "#한글");
    assert.match(post.text.split("\n\n")[0] ?? "", /^가+$/);
    assert.equal(post.weightedLength, xWeightedLength(post.text));
  });

  it("does not slice a URL or a hashtag that does not fit", () => {
    const embedded = "https://example.com/abcdefghijklmnopqrstuvwxyz-must-stay-whole";
    const post = composeXPost({
      instagramCaption: `${"나".repeat(140)} ${embedded}`,
      hashtags: `#${"가".repeat(200)} #ok`,
    });
    assert.ok(post.weightedLength <= X_MAX_WEIGHTED_LENGTH);
    assert.equal(post.text.includes(embedded), false);
    assert.equal(post.text.includes("https://example.com/abcdefghij"), false);
    assert.equal(post.text.includes(`#${"가".repeat(200)}`), false);
    assert.equal(post.text.includes("#가"), false);
    assert.match(post.text, /#ok$/);
  });

  it("does not split an emoji when the next one would pass 280", () => {
    const post = composeXPost({ instagramCaption: "😀".repeat(141) });
    assert.equal(post.text, "😀".repeat(140));
    assert.equal(post.weightedLength, 280);
  });
});
