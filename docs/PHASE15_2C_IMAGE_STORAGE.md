# Phase 15.2C-1 — Durable, owner-scoped image storage

Uploaded post images are stored in a public **Vercel Blob** store under an owner-scoped path. Vercel functions have a read-only filesystem (only `/tmp` is writable, per instance), so the previous `public/uploads/...` disk writes could not work in production. No auth, billing, scheduler, `/ops` or Prisma schema changes. No cleanup or background jobs (Phase 15.2C-2).

## Setup (Vercel)

1. Create a **public** Blob store (access mode can't be changed later). Prefer a separate store for Preview.
2. Connect the store to the project for the matching environment. Vercel adds `BLOB_STORE_ID` (OIDC auth, no long-lived secret). Outside Vercel, use `BLOB_READ_WRITE_TOKEN` instead.
3. Set `PROMI_MEDIA_BLOB_HOST` per environment to the store's public host, e.g. `abc123.public.blob.vercel-storage.com` (copy it from any blob URL in the store dashboard). Only this host is ever accepted.
4. Redeploy. `npm run check:internal-beta` reports `Image storage: Vercel Blob (<host>)`, or a warning when unconfigured.

## Storage modes (`src/lib/media/image-storage.ts`)

| Condition | Mode | Upload result |
|---|---|---|
| Valid `PROMI_MEDIA_BLOB_HOST` + Blob credentials | `blob` | `https://<host>/scheduled-images/<owner-key>/<uuid>.<ext>` |
| Otherwise, `NODE_ENV !== "production"` | `local` | `/uploads/scheduled-images/<owner-key>/<uuid>.<ext>` (gitignored) |
| Otherwise (production, Preview included) | `unavailable` | `503 IMAGE_STORAGE_UNAVAILABLE`, checked before the body is read; nothing is written |

- `<owner-key>` = first 32 hex chars of SHA-256 of the owner id (owner ids never appear in URLs).
- Uploads: jpg/jpeg/png/webp, max **4MB** (Vercel's function request-body limit is 4.5MB). Rate limit unchanged (20/hour/owner).
- Blob errors meaning the store is suspended, missing, unauthorized, rate-limited or down map to `503`; anything else is `500 IMAGE_UPLOAD_FAILED`. The returned blob URL must match the pinned host and owner folder, otherwise the blob is deleted and the upload fails.
- Uploaded images render with `next/image` `unoptimized`, so they don't use Vercel Image Optimization quota. `next.config.ts` also allows the pinned host under `/scheduled-images/**`.

## Image URL rules

Checked when a scheduled post is created (`POST /api/scheduled-posts`, `400` on reject) and again before an X post is published (the post fails with a clear message; nothing is fetched).

| `imageUrl` | Schedule | X publish |
|---|---|---|
| none | allowed | no image |
| exact sample catalog image (`/images/…` from `lib/mock-data.ts`) | allowed | not attached |
| pinned Blob host, caller's owner folder, canonical `uuid.ext` | allowed | attached |
| pinned Blob host, another owner's folder | `IMAGE_NOT_OWNED` | rejected |
| any other host, `http:`, port, userinfo, query/hash, `..`, encoded or non-canonical path | `INVALID_IMAGE_URL` | rejected if upload-shaped, otherwise not attached |
| arbitrary HTTPS / `data:` / other paths | `INVALID_IMAGE_URL` | not attached |
| `/uploads/scheduled-images/…` in production | `IMAGE_UNAVAILABLE` | rejected |
| `/uploads/scheduled-images/<own-key>/…` or flat legacy file, outside production | allowed | attached (read from disk) |
| `/uploads/scheduled-images/<other-key>/…` outside production | `IMAGE_NOT_OWNED` | rejected |

The publisher downloads Blob images with `redirect: "error"`, a 15s timeout and a 5MB cap, and only from the pinned host. Local files are read from fixed path segments, so traversal is impossible.

## Create workflow

- New files upload once, on Save draft or Schedule. After a successful upload the file input is cleared and the URL is reused (including retries after a failed schedule), so the same image is never uploaded twice.
- **Remove image** clears the chosen file and the saved image. Use it when an old image is rejected or uploads are unavailable.
- Reopened drafts, Duplicate/Reschedule and templates restore only Promi-uploaded images; sample images come from the catalog product itself.

## Migration

- Existing local `/uploads/...` URLs stay usable in development only. In production they are rejected at schedule time and at publish time with "This image is no longer available. Remove it or upload it again." No files are migrated: production never had working runtime uploads.
- The 9 dev images previously committed under `public/uploads/` are untracked and `public/uploads/` is gitignored, so they stop being served after the next deploy.
- Local development needs no setup (local mode). To test Blob locally, connect a dev store and run `vercel env pull`, or set `BLOB_READ_WRITE_TOKEN` + `PROMI_MEDIA_BLOB_HOST`.

## Hobby plan caveats

Blob is free on Hobby within the included usage, which is **shared across all Vercel services in the project**:

- Storage 1GB/month average. With no cleanup yet, storage only grows: roughly 650 images at 1.5MB average, 250 at the 4MB cap.
- 2,000 advanced operations/month: each upload is one `put`. Browsing the store in the Vercel dashboard also counts.
- 10,000 simple operations/month (blob reads that miss the cache) and 10GB data transfer.
- Operation rate limits: 15 advanced/s, 20 simple/s.
- **Hard cutoff:** if a limit is exceeded, Blob is unavailable until 30 days have passed. Uploads then return `503`, and existing image URLs stop loading, so scheduled posts with images fail at publish ("Could not download the post image…"). Posts without images are unaffected.
- Watch Usage → Blob in the Vercel dashboard. Upgrading to Pro removes the cutoff (usage-based billing).
- Vercel's Hobby plan is for non-commercial use; revisit the plan before a paid launch.

## Deferred (Phase 15.2C-2 and later)

- Cleanup of orphaned blobs (replaced or deleted drafts, abandoned uploads, Start another post). Must be age-based because drafts and templates live in localStorage.
- Owner-scoped templates storage key.
- `uploaded_media` table, quotas, private store, browser-direct uploads, image resizing, purge on account deletion.
