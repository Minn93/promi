import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PREVIOUS_ACCOUNT_UNAVAILABLE_NOTICE,
  applyTemplateBrief,
  draftAccountRestoreNotice,
  draftContextForStorage,
  readDraftContext,
  restoreDraftAccount,
  restoreDraftPlatform,
  templateBriefFromCreate,
  templateBriefFromScheduledPost,
  type CampaignBrief,
  type ConnectedAccountSnapshot,
  type StoredTemplateBrief,
} from "./draft-template-context";

const CURRENT_BRIEF: CampaignBrief = {
  name: "Current candle",
  description: "Current details",
  price: "$18",
  url: "https://shop.example/current",
};

const ACTIVE_X: ConnectedAccountSnapshot = { id: "acc-x", platform: "x", status: "active" };
const OTHER_X: ConnectedAccountSnapshot = { id: "acc-other", platform: "x", status: "active" };

describe("draft platform and account storage", () => {
  it("keeps an explicitly selected X account and omits the most-recent selection", () => {
    assert.deepEqual(draftContextForStorage("x", "acc-x"), { platform: "x", accountId: "acc-x" });
    assert.deepEqual(draftContextForStorage("x", "  acc-x  "), { platform: "x", accountId: "acc-x" });
    assert.deepEqual(draftContextForStorage("x", ""), { platform: "x" });
    assert.deepEqual(draftContextForStorage("x", "   "), { platform: "x" });
  });

  it("stores Instagram and Facebook platforms without an account id", () => {
    assert.deepEqual(draftContextForStorage("instagram", "acc-x"), { platform: "instagram" });
    assert.deepEqual(draftContextForStorage("facebook", "acc-x"), { platform: "facebook" });
  });
});

describe("old and partial drafts", () => {
  it("restores missing platform as X and missing account as most recently connected", () => {
    assert.equal(restoreDraftPlatform(undefined), "x");
    assert.equal(restoreDraftPlatform("tiktok"), "x");
    assert.deepEqual(readDraftContext({ productName: "Candle", instagramCaption: "Hello" }), { platform: "x" });
    assert.deepEqual(
      restoreDraftAccount("x", "", [ACTIVE_X]),
      { status: "recent", accountId: "" },
    );
    assert.equal(draftAccountRestoreNotice({ status: "recent", accountId: "" }), null);
  });

  it("does not throw on corrupt draft context", () => {
    assert.doesNotThrow(() => readDraftContext(null));
    assert.doesNotThrow(() => readDraftContext("nope"));
    assert.doesNotThrow(() => readDraftContext([]));
    assert.deepEqual(readDraftContext({ platform: 1, accountId: 9, channels: "instagram" }), { platform: "x" });
  });
});

describe("draft account restore", () => {
  it("restores a saved platform", () => {
    assert.equal(restoreDraftPlatform("x"), "x");
    assert.equal(restoreDraftPlatform("instagram"), "instagram");
    assert.equal(restoreDraftPlatform("facebook"), "facebook");
  });

  it("restores an account only when it is still an active X account", () => {
    const restored = restoreDraftAccount("x", "acc-x", [OTHER_X, ACTIVE_X, { id: "acc-ig", platform: "instagram", status: "active" }]);
    assert.deepEqual(restored, { status: "restored", accountId: "acc-x" });
    assert.equal(draftAccountRestoreNotice(restored), null);
  });

  it("waits to decide while the owner's account list is still loading", () => {
    assert.deepEqual(restoreDraftAccount("x", "acc-x", null), { status: "pending" });
    assert.equal(draftAccountRestoreNotice({ status: "pending" }), null);
  });

  it("falls back when the saved account is missing or inactive", () => {
    const accounts: ConnectedAccountSnapshot[] = [
      { id: "acc-expired", platform: "x", status: "expired" },
      { id: "acc-revoked", platform: "x", status: "revoked" },
      { id: "acc-error", platform: "x", status: "error" },
      { id: "acc-ig", platform: "instagram", status: "active" },
    ];
    for (const id of ["acc-missing", "acc-expired", "acc-revoked", "acc-error", "acc-ig"]) {
      const restored = restoreDraftAccount("x", id, accounts);
      assert.deepEqual(restored, { status: "unavailable", accountId: "" });
      assert.equal(draftAccountRestoreNotice(restored), PREVIOUS_ACCOUNT_UNAVAILABLE_NOTICE);
    }
  });

  it("does not restore an account id for Instagram or Facebook drafts", () => {
    assert.deepEqual(readDraftContext({ platform: "instagram", accountId: "acc-x" }), { platform: "instagram" });
    assert.deepEqual(restoreDraftAccount("instagram", "acc-x", [ACTIVE_X]), { status: "recent", accountId: "" });
    assert.deepEqual(restoreDraftAccount("facebook", "acc-x", null), { status: "recent", accountId: "" });
  });
});

describe("reusable template brief", () => {
  it("restores every brief field a new template contains, including blanks", () => {
    const applied = applyTemplateBrief(CURRENT_BRIEF, {
      productName: "Spring sale",
      productDescription: "Weekend offer",
      productPrice: "",
      productUrl: "https://shop.example/spring",
    });
    assert.deepEqual(applied, {
      name: "Spring sale",
      description: "Weekend offer",
      price: "",
      url: "https://shop.example/spring",
    });
  });

  it("leaves the current brief unchanged when an old template has no brief fields", () => {
    const oldTemplate = {
      platform: "instagram",
      instagramCaption: "Saved caption",
      accountId: "acc-should-not-stick",
    };
    assert.deepEqual(applyTemplateBrief(CURRENT_BRIEF, oldTemplate as unknown as StoredTemplateBrief), CURRENT_BRIEF);
    assert.deepEqual(Object.keys(templateBriefFromCreate(CURRENT_BRIEF)).sort(), [
      "productDescription",
      "productName",
      "productPrice",
      "productUrl",
    ]);
  });

  it("applies only the brief fields a partial template contains", () => {
    const applied = applyTemplateBrief(CURRENT_BRIEF, { productDescription: "Updated details" });
    assert.deepEqual(applied, { ...CURRENT_BRIEF, description: "Updated details" });
    const priceOnly = applyTemplateBrief(CURRENT_BRIEF, { productPrice: "20% off" });
    assert.equal(priceOnly.price, "20% off");
    assert.equal(priceOnly.name, CURRENT_BRIEF.name);
  });

  it("saves the create brief and ignores non-string corrupt values", () => {
    assert.deepEqual(
      templateBriefFromCreate({ name: " Candle ", description: " Soy ", price: " $24 ", url: " https://shop.example/candle " }),
      {
        productName: "Candle",
        productDescription: "Soy",
        productPrice: "$24",
        productUrl: "https://shop.example/candle",
      },
    );
    assert.deepEqual(applyTemplateBrief(CURRENT_BRIEF, { productName: 4 as unknown as string }), CURRENT_BRIEF);
  });

  it("builds a history template brief from product name and contentPayload.brief", () => {
    assert.deepEqual(
      templateBriefFromScheduledPost({
        productName: " Hand-poured candle ",
        contentPayload: {
          instagramCaption: "Hello",
          brief: {
            description: " Small batch ",
            price: " $24 ",
            url: " https://shop.example/candle ",
            source: "custom",
          },
        },
      }),
      {
        productName: "Hand-poured candle",
        productDescription: "Small batch",
        productPrice: "$24",
        productUrl: "https://shop.example/candle",
      },
    );
  });

  it("keeps history brief fields absent when the post has no brief", () => {
    assert.deepEqual(
      templateBriefFromScheduledPost({ productName: "Candle", contentPayload: { instagramCaption: "Hello" } }),
      { productName: "Candle" },
    );
    assert.deepEqual(
      templateBriefFromScheduledPost({
        productName: "Candle",
        contentPayload: { brief: { url: "https://shop.example/candle" } },
      }),
      { productName: "Candle", productUrl: "https://shop.example/candle" },
    );
    assert.deepEqual(templateBriefFromScheduledPost({ contentPayload: null }), {});
    assert.doesNotThrow(() => templateBriefFromScheduledPost(null));
    assert.deepEqual(templateBriefFromScheduledPost("corrupt"), {});
  });
});
