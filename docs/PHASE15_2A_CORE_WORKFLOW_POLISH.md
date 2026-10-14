# Phase 15.2A — Core workflow polish

UI and copy changes to the Create → Schedule → Scheduled → History flow. There are no API, auth, billing, DB schema, scheduler or `/ops` changes and no new dependencies, and nothing is really published to Instagram or Facebook.

## What changed

- **Bare `/create`**: without a `productId`, Create shows "Choose what to promote" with the sample catalog. Picking a product keeps `templateId` / `promotionId` in the URL (`/create?templateId=abc` → `/create?productId=…&templateId=abc`). An unknown `productId` shows the same picker.
- **Real vs test publishing**: Create defaults to X. Instagram and Facebook are labelled "test only, not posted". Mock publish messages are shown as "Test publish — not posted to {platform}." in Scheduled and History, and published posts on those platforms are labelled "Test publish". See `lib/publish-platform-copy.ts`.
- **Scheduler timing copy**: there is no cron, so the copy no longer promises automatic or exact-time publishing. Strings live in `lib/publishing-timing-copy.ts` and `lib/post-status-copy.ts`. **Update them when beta automatic scheduling is re-enabled** (see `docs/DEVELOPMENT.md`, "User-facing timing copy").
- **Generate errors**: API error codes are mapped to plain language in Create (`generateErrorMessage`).
- **X preview**: when X is selected, Create shows "This is what will be posted to X". It is built with `composePublishText` (`src/lib/services/posts/publish-text.ts`), the same function the publisher uses, and shows a live character count. Hashtags are excluded, and the preview says so.
- **Formats vs destination**: "Channels" is renamed "Copy formats to generate". "Publish to" now comes right after the product card. Scheduled cards show "Publish to: …" instead of copy-format chips.
- **X connection warning**: when X is selected and there is no active X account, an inline warning appears with a Connect X / Reconnect X action that opens in a new tab. Create re-reads accounts when the tab regains focus.
- **Duplicate schedule guard**: after a successful schedule the button reads "Scheduled" until the copy, date, time, platform or account changes. A "Start another post" action clears the copy, date, time and image.
- **Needs-reconnect recovery**: Scheduled shows Retry next to Reconnect account for needs-reconnect posts (the retry API already accepted `needs_reconnect`). Reconnect opens in a new tab.

## Deferred — Phase 15.2B candidates

- **Free-form product / campaign idea entry**: let users describe what to promote without picking a catalog product. This needs a product/idea source decision; 15.2A only adds the sample-catalog picker.
- **Hashtags in X text**: decide whether to append hashtags to the X post (this is a publishing-content change and must update `composePublishText` and its preview together).
- **History post identity**: show product name / post excerpt instead of only the post ID.
- **Drafts keep platform, account and image**: local drafts store copy and date/time only.
- **Plan limit counts failed / needs-reconnect posts as active**: revisit what counts toward `scheduledPostsActive`.
- **Dedicated X field**: edit the X text directly instead of deriving it from the Instagram/Pinterest fields.
- **Real Instagram / Facebook publishing**: out of scope until platform review; labels stay "test only".
