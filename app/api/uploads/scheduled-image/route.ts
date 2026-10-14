import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { accountGateApiError, checkOwnerAccountGates } from "@/src/lib/auth/user-status";
import { getCurrentOwnerId } from "@/src/lib/auth/session";
import { getMediaStorageMode, storeScheduledImage } from "@/src/lib/media/image-storage";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  IMAGE_UPLOAD_MAX_BYTES,
  extensionFromName,
  isAllowedImageByName,
  isAllowedImageMime,
} from "@/src/lib/media/image-upload";
import { consumeRateLimit, RATE_LIMITS } from "@/src/lib/rate-limit/server";

export const runtime = "nodejs";

const STORAGE_UNAVAILABLE_MESSAGE = "Image uploads aren't available right now. Remove the image to continue without it.";

function allowedExtensionsLabel() {
  return Array.from(ALLOWED_IMAGE_EXTENSIONS).join(", ");
}

function storageUnavailable(details?: string) {
  return apiError({
    status: 503,
    code: "IMAGE_STORAGE_UNAVAILABLE",
    message: STORAGE_UNAVAILABLE_MESSAGE,
    details,
  });
}

export async function POST(request: Request) {
  let ownerId: string;
  try {
    ownerId = (await getCurrentOwnerId()).trim();
  } catch {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (!ownerId) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "Authentication required." });
  }

  const rl = await consumeRateLimit({
    namespace: "upload_scheduled_image_owner",
    identifier: ownerId,
    max: RATE_LIMITS.uploadPerOwner.max,
    window: RATE_LIMITS.uploadPerOwner.window,
  });
  if (!rl.ok) {
    if (rl.kind === "store_required") {
      return apiError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please try again later.",
      });
    }
    return apiError({
      status: 429,
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests. Please try again later.",
    });
  }

  const gate = await checkOwnerAccountGates(ownerId, { requireVerifiedEmail: true });
  if (gate) return accountGateApiError(gate);

  const storageMode = getMediaStorageMode();
  if (storageMode === "unavailable") {
    console.warn("[api/uploads/scheduled-image] durable image storage is not configured; returning 503.");
    return storageUnavailable();
  }

  console.info("[api/uploads/scheduled-image]", { ownerPrefix: ownerId.slice(0, 6), storageMode });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError({ status: 400, code: "INVALID_FORM_DATA", message: "Invalid multipart form data." });
  }

  const fileValue = form.get("image");
  if (!(fileValue instanceof File)) {
    return apiError({ status: 400, code: "MISSING_IMAGE", message: "Image file is required." });
  }

  const image = fileValue;
  const ext = extensionFromName(image.name);
  if (!ext || !isAllowedImageByName(image.name) || !isAllowedImageMime(image.type)) {
    return apiError({
      status: 400,
      code: "INVALID_IMAGE_TYPE",
      message: `Only ${allowedExtensionsLabel()} images are supported.`,
    });
  }
  if (image.size <= 0) {
    return apiError({ status: 400, code: "EMPTY_IMAGE", message: "Uploaded image is empty." });
  }
  if (image.size > IMAGE_UPLOAD_MAX_BYTES) {
    return apiError({
      status: 400,
      code: "IMAGE_TOO_LARGE",
      message: `Image must be ${Math.floor(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB or smaller.`,
    });
  }

  const stored = await storeScheduledImage(ownerId, image, ext);
  if (!stored.ok) {
    console.error("[api/uploads/scheduled-image] store failed:", { reason: stored.reason, details: stored.details });
    if (stored.reason === "unavailable") return storageUnavailable();
    return apiError({
      status: 500,
      code: "IMAGE_UPLOAD_FAILED",
      message: "Could not upload image.",
    });
  }

  return NextResponse.json(
    {
      data: {
        imageUrl: stored.imageUrl,
        mimeType: image.type,
        size: image.size,
      },
    },
    { status: 201 },
  );
}
