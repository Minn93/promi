import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  IMAGE_UPLOAD_MAX_BYTES,
  extensionFromName,
  isAllowedImageByName,
  isAllowedImageMime,
} from "@/src/lib/media/image-upload";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "scheduled-images");

function allowedExtensionsLabel() {
  return Array.from(ALLOWED_IMAGE_EXTENSIONS).join(", ");
}

export async function POST(request: Request) {
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
  if (!isAllowedImageByName(image.name) || !isAllowedImageMime(image.type)) {
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

  try {
    const ext = extensionFromName(image.name) ?? "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const absolutePath = path.join(UPLOAD_DIR, filename);
    await mkdir(UPLOAD_DIR, { recursive: true });
    const bytes = await image.arrayBuffer();
    await writeFile(absolutePath, Buffer.from(bytes));

    return NextResponse.json(
      {
        data: {
          imageUrl: `/uploads/scheduled-images/${filename}`,
          mimeType: image.type,
          size: image.size,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    return apiError({
      status: 500,
      code: "IMAGE_UPLOAD_FAILED",
      message: "Could not upload image.",
      details,
    });
  }
}
