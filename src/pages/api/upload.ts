import type { APIRoute } from "astro";
export const prerender = false;

import { getAuthUser } from "../../lib/auth";
import { ok, err } from "../../lib/api-utils";
import { randomUUID } from "node:crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const POST: APIRoute = async (context) => {
  try {
    const user = await getAuthUser(context);
    if (!user) return err("Unauthorized", 401, "unauthorized");

    const formData = await context.request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) return err("Nenhum arquivo enviado", 400, "no_file");

    if (file.size > MAX_FILE_SIZE) return err("Arquivo muito grande (máx. 5MB)", 400, "file_too_large");
    if (!ALLOWED_TYPES.includes(file.type)) return err("Tipo de arquivo inválido. Permitidos: JPEG, PNG, GIF, WebP", 400, "invalid_type");

    const ext = file.type.split("/")[1] || "jpg";
    const filename = `${randomUUID()}.${ext}`;
    const appUrl = process.env.PUBLIC_APP_URL || "http://localhost:4321";

    // Try Cloudflare R2 bucket first
    const runtime = (context.locals as any).runtime;
    const bucket: R2Bucket | undefined = runtime?.env?.UPLOADS_BUCKET;

    if (bucket) {
      await bucket.put(filename, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
      // R2 public URL (configured via bucket's public URL or custom domain)
      const publicUrlBase = process.env.R2_PUBLIC_URL || `${appUrl}/uploads`;
      const url = `${publicUrlBase}/${filename}`;
      return ok({ url });
    }

    // Fallback for local dev: write to disk
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
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