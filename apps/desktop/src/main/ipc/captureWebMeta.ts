/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";
import { parseWebMetadataFromHtml } from "@openloaf/api";

const META_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type WebMetaCaptureInput = {
  /** Target url. */
  url: string;
  /** Workspace/project root uri. */
  rootUri: string;
};

export type WebMetaCaptureResult = {
  /** Whether capture succeeded. */
  ok: boolean;
  /** Requested url. */
  url: string;
  /** Page title text. */
  title?: string;
  /** Page description text. */
  description?: string;
  /** Relative logo path under .openloaf/desktop. */
  logoPath?: string;
  /** Relative preview path under .openloaf/desktop. */
  previewPath?: string;
  /** Error message when capture fails. */
  error?: string;
};

/** Resolve a local filesystem path from a file:// URI. */
function resolveRootPath(rootUri: string): string {
  const trimmed = rootUri.trim();
  if (!trimmed.startsWith("file://")) {
    throw new Error("Invalid root uri");
  }
  return fileURLToPath(trimmed);
}

/** Build web meta storage directory for a url. */
function buildWebMetaDir(rootPath: string, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return path.join(rootPath, ".openloaf", "desktop", hash);
}

type IconFetcher = (url: string) => Promise<Response>;

/** Fetch icon bytes with Chromium network stack or data URLs. */
async function fetchIconBuffer(iconUrl: string, fetcher: IconFetcher): Promise<Buffer | null> {
  if (!iconUrl) return null;
  if (iconUrl.startsWith("data:")) {
    const match = iconUrl.match(/^data:(.*?)(;base64)?,(.*)$/);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? "";
    return isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
  }
  const response = await fetcher(iconUrl);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

/** Download a remote icon and save as png. */
async function downloadIconAsPng(
  iconUrl: string,
  targetPath: string,
  fetcher: IconFetcher
): Promise<boolean> {
  try {
    const buffer = await fetchIconBuffer(iconUrl, fetcher);
    if (!buffer) return false;
    const sharp = (await import("sharp")).default;
    await sharp(buffer).png().toFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** Capture web metadata, favicon, and screenshot using Electron. */
export async function captureWebMeta(input: WebMetaCaptureInput): Promise<WebMetaCaptureResult> {
  const url = input.url.trim();
  if (!url) return { ok: false, url: "", error: "url is required" };

  let rootPath = "";
  try {
    rootPath = resolveRootPath(input.rootUri);
  } catch {
    return { ok: false, url, error: "Invalid root uri" };
  }

  const storageDir = buildWebMetaDir(rootPath, url);
  await fs.mkdir(storageDir, { recursive: true });

  const logoPath = path.join(storageDir, "logo.png");
  const previewPath = path.join(storageDir, "preview.jpg");

  let faviconUrl = "";
  let win: BrowserWindow | null = null;

  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const wc = win.webContents;
    wc.setUserAgent(META_USER_AGENT);

    wc.on("page-favicon-updated", (_event, favicons) => {
      const favicon = Array.isArray(favicons) ? favicons[0] : undefined;
      if (favicon && !faviconUrl) faviconUrl = String(favicon);
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Load timeout"));
      }, 15000);

      wc.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });

      wc.once("did-fail-load", (_event, _code, desc) => {
        clearTimeout(timer);
        reject(new Error(desc || "Load failed"));
      });

      wc.loadURL(url).catch(reject);
    });

    const html = await wc.executeJavaScript("document.documentElement.outerHTML", true);
    const parsedMeta = parseWebMetadataFromHtml(String(html ?? ""), url);
    const title = parsedMeta.title || wc.getTitle() || "";
    const description = parsedMeta.description || "";

    const iconUrl = faviconUrl || parsedMeta.iconUrl;
    const [logoOk, previewImage] = await Promise.all([
      downloadIconAsPng(iconUrl, logoPath, (icon) =>
        wc.session.fetch(icon, { headers: { "user-agent": META_USER_AGENT } })
      ),
      wc.capturePage(),
    ]);

    // 中文注释：使用 JPEG 输出降低预览图体积。
    await fs.writeFile(previewPath, previewImage.toJPEG(80));

    return {
      ok: true,
      url,
      title: title || undefined,
      description: description ? String(description) : undefined,
      logoPath: logoOk ? path.relative(rootPath, logoPath).replace(/\\/g, "/") : undefined,
      previewPath: path.relative(rootPath, previewPath).replace(/\\/g, "/"),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      error: (error as Error)?.message ?? "Capture failed",
    };
  } finally {
    if (win) {
      win.destroy();
    }
  }
}
