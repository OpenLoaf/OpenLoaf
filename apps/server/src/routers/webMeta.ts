/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { BaseWebMetaRouter, webMetaSchemas, t, shieldedProcedure } from "@openloaf/api";
import { resolveFilePathFromUri } from "@openloaf/api/services/vfsService";
import type { Response } from "undici";
import { parseWebMetadataFromHtml } from "@openloaf/api";
import type { WebMetadata } from "@openloaf/api";

/** Timeout for fetching HTML content. */
const DEFAULT_TIMEOUT_MS = 8000;
/** Maximum bytes to read from HTML responses. */
const MAX_HTML_BYTES = 512 * 1024;
/** User agent for web meta fetches. */
const META_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Read response text while enforcing a max byte limit. */
async function readTextWithLimit(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.length;
    if (total > limit) {
      // 中文注释：超出限制时截断并停止读取，避免占用过多内存。
      const overflow = total - limit;
      chunks.push(value.slice(0, Math.max(0, value.length - overflow)));
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  chunks.forEach(chunk => {
    buffer.set(chunk, offset);
    offset += chunk.length;
  });
  return new TextDecoder("utf-8").decode(buffer);
}

/** Fetch HTML and extract web metadata. */
async function fetchWebMetadata(url: string): Promise<WebMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": META_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      // 中文注释：非 HTML 或请求失败时直接走兜底信息。
      return {
        title: "",
        description: "",
        iconUrl: "",
      };
    }
    const html = await readTextWithLimit(response, MAX_HTML_BYTES);
    return parseWebMetadataFromHtml(html, url);
  } catch {
    // 中文注释：捕获网络异常，保持返回结构完整。
    return {
      title: "",
      description: "",
      iconUrl: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Build web meta storage directory for a url. */
function buildWebMetaDir(rootPath: string, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return path.join(rootPath, ".openloaf", "desktop", hash);
}

/** Download a remote icon and save as png. */
async function downloadIconAsPng(iconUrl: string, targetPath: string): Promise<boolean> {
  try {
    if (!iconUrl) return false;
    const response = await fetch(iconUrl, { headers: { "user-agent": META_USER_AGENT } });
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    await sharp(buffer).png().toFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** Capture a preview screenshot for the given url. */
async function capturePreview(url: string, targetPath: string): Promise<boolean> {
  let browser: import("playwright-core").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    // 中文注释：等待短暂渲染时间，避免空白截图。
    await page.waitForTimeout(800);
    await page.screenshot({ path: targetPath, type: "jpeg", quality: 80 });
    return true;
  } catch {
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export class WebMetaRouterImpl extends BaseWebMetaRouter {
  /** Web meta router implementation. */
  public static createRouter() {
    return t.router({
      capture: shieldedProcedure
        .input(webMetaSchemas.capture.input)
        .output(webMetaSchemas.capture.output)
        .mutation(async ({ input }) => {
          const url = input.url;
          const rootUri = String(input.rootUri ?? "").trim();
          if (!rootUri) {
            return { ok: false, url, error: "rootUri is required" };
          }
          let rootPath = "";
          try {
            rootPath = resolveFilePathFromUri(rootUri);
          } catch {
            return { ok: false, url, error: "Invalid root uri" };
          }

          const metadata = await fetchWebMetadata(url);
          const storageDir = buildWebMetaDir(rootPath, url);
          await fs.mkdir(storageDir, { recursive: true });

          const logoPath = path.join(storageDir, "logo.png");
          const previewPath = path.join(storageDir, "preview.jpg");

          const [logoOk, previewOk] = await Promise.all([
            downloadIconAsPng(metadata.iconUrl, logoPath),
            capturePreview(url, previewPath),
          ]);

          return {
            ok: true,
            url,
            title: metadata.title || undefined,
            description: metadata.description || undefined,
            logoPath: logoOk ? path.relative(rootPath, logoPath).replace(/\\/g, "/") : undefined,
            previewPath: previewOk ? path.relative(rootPath, previewPath).replace(/\\/g, "/") : undefined,
          };
        }),
    });
  }
}

export const webMetaRouterImplementation = WebMetaRouterImpl.createRouter();
