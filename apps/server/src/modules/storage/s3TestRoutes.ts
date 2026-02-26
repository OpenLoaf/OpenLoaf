import type { Hono } from "hono";
import { readS3Providers } from "@/modules/settings/openloafConfStore";
import { createS3StorageService, resolveS3ProviderConfig } from "@/modules/storage/s3StorageService";

/** Max file size for S3 test uploads. */
const MAX_S3_TEST_BYTES = 10 * 1024 * 1024;

/**
 * Normalize text fields from request payloads.
 */
function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Guard for multipart file payloads.
 */
function isFileLike(value: unknown): value is File {
  return Boolean(value) && typeof value === "object" && "arrayBuffer" in (value as File);
}

/**
 * Sanitize file names for object keys.
 */
function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Register S3 test upload routes.
 */
export function registerS3TestRoutes(app: Hono) {
  app.post("/settings/s3/test-upload", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.parseBody()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid multipart body" }, 400);
    }

    const providerKey = toText(body.providerKey);
    const rawFile = body.file;
    const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;
    if (!providerKey || !isFileLike(file)) {
      return c.json({ error: "Missing required upload fields" }, 400);
    }

    const providerEntry = readS3Providers().find((entry) => entry.title === providerKey);
    if (!providerEntry) {
      return c.json({ error: "S3 provider not found" }, 404);
    }

    const size = typeof file.size === "number" ? file.size : 0;
    if (size > MAX_S3_TEST_BYTES) {
      return c.json({ error: "File too large" }, 413);
    }

    try {
      // 中文注释：测试上传使用临时前缀，便于后续清理。
      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaType = file.type || "application/octet-stream";
      const safeName = sanitizeFileName(file.name || "upload");
      const objectKey = `ai-temp/test/${Date.now()}-${safeName}`;
      const storage = createS3StorageService(resolveS3ProviderConfig(providerEntry));
      const result = await storage.putObject({
        key: objectKey,
        body: buffer,
        contentType: mediaType,
        contentLength: buffer.byteLength,
      });
      return c.json({
        url: result.url,
        key: result.key,
        bucket: providerEntry.bucket,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Upload failed" },
        500,
      );
    }
  });
}
