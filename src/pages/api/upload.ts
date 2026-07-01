import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../lib/auth";
import { ok, err } from "../../lib/api-utils";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const formData = await context.request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) return err("No file uploaded", 400, "no_file");

    if (file.size > MAX_FILE_SIZE) return err("File too large (max 5MB)", 400, "file_too_large");
    if (!ALLOWED_TYPES.includes(file.type)) return err("Invalid file type. Allowed: JPEG, PNG, GIF, WebP", 400, "invalid_type");

    const ext = file.type.split("/")[1] || "jpg";
    const filename = `${randomUUID()}.${ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, filename), buffer);

    const url = `/uploads/${filename}`;
    return ok({ url });
  } catch (caughtErr) {
    console.error("Upload error:", caughtErr);
    return err("Internal server error", 500);
  }
};