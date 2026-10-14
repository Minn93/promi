# Phase 15.2B — Free-form product / campaign entry

Create no longer requires a sample catalog product. Users either describe their own product or campaign, or start from a sample product to prefill the same fields. There are no API, auth, billing, Prisma schema, scheduler or `/ops` changes, no new dependencies, and the X publish text is unchanged.

## "What are you promoting?" brief

| Field | Required | Client max | Notes |
|---|---|---|---|
| Product or campaign name | Yes (Generate, Save draft, Schedule) | 80 | Sent as `productName`. |
| What should people know? | Yes for Generate | 600 | Sent as `productDescription`. |
| Price or offer | No | 40 | Free text; sent as `productPrice` (`"Not specified"` when blank). |
| Link | No | 300 | Must be http/https. Saved only: not sent to generation, not added to copy or X text. |

"Or start from a sample product" fills the fields and sets `productId` in the URL with `history.replaceState`. Other query parameters (`templateId`, `promotionId`) are kept.

## Subject model (`components/create-promotion-form.tsx`)

`{ kind: "catalog" | "custom" | "reused", id, name, description, price, image, url }`

- **catalog**: a sample product whose name is unchanged. `id` = catalog id, `image` = sample image.
- **reused**: restored from a draft or a scheduled post that isn't a sample product. `id` = original `productId`, kept while the name is unchanged.
- **custom**: anything else. `id` = `custom-` + FNV-1a hash of normalized name + description, so different campaigns that share a name don't share an id. `image` = null.

## Storage

- **Scheduled posts**: `productId` = subject id, `productName` = subject name, `imageUrl` = new upload → reused upload → sample image → `null`. `contentPayload.brief = { description, price, url, source }` (optional; X text ignores it; the edit form preserves it).
- **Local drafts** (`Promotion`): optional `source`, `productDescription`, `productPrice`, `productUrl`. `productImage` = uploaded image URL → sample image → `""`. Drafts saved before 15.2B have none of these; sample-product drafts fall back to the catalog entry.
- **Templates**: unchanged format.

## Images

Only images uploaded through Promi are attached to X posts (Vercel Blob since Phase 15.2C-1; local `/uploads/scheduled-images/…` in development). Ownership and host checks live in `src/lib/media/image-storage.ts` — see `docs/PHASE15_2C_IMAGE_STORAGE.md`. The X preview states whether an image will be attached. Previews and Drafts show a neutral "No image" placeholder instead of a sample image.

### Draft images

Save draft with a newly chosen file uploads it first through `POST /api/uploads/scheduled-image` (the same endpoint Schedule uses), then stores the returned URL in `productImage`. File data is never written to localStorage. An image that is already uploaded (from a reopened draft, a template or a source post) is reused without uploading again. If the upload fails, the draft is not created or updated and the user is told to try again or remove the image.

Reopening a draft whose `productImage` is a Promi upload restores it as the current uploaded image, so previews show it, the X preview says it will be attached, and Schedule sends the same URL without a new upload. Sample-product drafts keep the sample details and use the uploaded image when one replaced the sample image.

## Deferred — Phase 15.2C candidates

- Links and hashtags in published X text (decide together; both change the 280-character count and the preview).
- Server-side length caps for generate/schedule inputs (client caps only today).
- Saving the brief with reusable templates.
- Drafts keeping platform and account.
- History post identity (product/campaign name or excerpt).
- Plan limit counting failed / needs-reconnect posts as active.
- Dedicated X text field.

## Deferred technical risks — Phase 15.2C

- **Production durability of uploaded images.** Addressed in Phase 15.2C-1 (Vercel Blob). See `docs/PHASE15_2C_IMAGE_STORAGE.md`.
- **Ownership.** Addressed in Phase 15.2C-1: owner-scoped paths, checked when scheduling and again before publishing.
- **Orphaned uploads.** Still open (Phase 15.2C-2). Files are left behind when a draft is deleted, a draft image is replaced, a schedule request fails after upload, or a user starts another post.
