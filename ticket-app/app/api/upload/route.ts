import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-middleware";
import { ok, err } from "@/lib/api-utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// @todo This is basic content-type validation, not a security boundary.
// A renamed .exe with a JPEG header prepended would pass.
// For production, use sharp to actually decode the image.
const JPEG_SIG = new Uint8Array([0xFF, 0xD8, 0xFF]);
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const GIF_SIG = new Uint8Array([0x47, 0x49, 0x46]);
const WEBP_SIG = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

/**
 * Check if the file content starts with known image magic bytes.
 */
function hasImageMagicBytes(buffer: ArrayBuffer): boolean {
  const header = new Uint8Array(buffer.slice(0, 4));
  const signatures = [JPEG_SIG, PNG_SIG, GIF_SIG, WEBP_SIG];
  for (const magic of signatures) {
    if (magic.length <= header.length && magic.every((b, i) => b === header[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Validate the file extension from content, not user-provided filename.
 * Returns a safe extension based on the detected magic bytes.
 */
function detectExtension(buffer: ArrayBuffer): string {
  const header = new Uint8Array(buffer.slice(0, 4));
  if (JPEG_SIG.every((b, i) => b === header[i])) return "jpg";
  if (PNG_SIG.every((b, i) => b === header[i])) return "png";
  if (GIF_SIG.every((b, i) => b === header[i])) return "gif";
  if (WEBP_SIG.every((b, i) => b === header[i])) return "webp";
  return "jpg"; // fallback — shouldn't happen after content validation
}

/**
 * POST /api/upload — Upload an image to Supabase Storage (authenticated only).
 * Returns the public URL of the uploaded file.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return err("Unauthorized", 401, "unauthorized");
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return err("No file provided", 400, "missing_file");
    }

    if (!file.type.startsWith("image/")) {
      return err("Only image files are accepted", 400, "invalid_type");
    }

    if (file.size > MAX_FILE_SIZE) {
      return err("File too large (max 5MB)", 400, "file_too_large");
    }

    // Validate file content via magic bytes (prevents renamed exe etc.)
    const arrayBuffer = await file.arrayBuffer();
    if (!hasImageMagicBytes(arrayBuffer)) {
      return err("File content does not match an accepted image format", 400, "invalid_content");
    }

    const supabase = createServerClient();
    const ext = detectExtension(arrayBuffer); // Use content-detected extension

    // If event_id is provided, use it in the path for organized storage
    const eventId = formData.get("event_id") as string | null;
    const pathPrefix = eventId ? `event-covers/${eventId}` : `event-covers/${user.id}`;
    const fileName = `${pathPrefix}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("event-covers")
      .upload(fileName, file, { upsert: false });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return err("Upload failed: " + uploadError.message, 500, "upload_error");
    }

    const { data: urlData } = supabase.storage
      .from("event-covers")
      .getPublicUrl(fileName);

    return ok({ url: urlData.publicUrl }, 201);
  } catch (caughtErr) {
    console.error("Upload error:", caughtErr);
    return err("Internal server error", 500);
  }
}