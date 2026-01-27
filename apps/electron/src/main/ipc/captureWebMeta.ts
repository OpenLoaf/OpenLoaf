import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";
import sharp from "sharp";

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
  /** Relative logo path under .tenas/desktop. */
  logoPath?: string;
  /** Relative preview path under .tenas/desktop. */
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
  return path.join(rootPath, ".tenas", "desktop", hash);
}

/** Build a fallback icon URL from the page origin. */
function buildFallbackIcon(url: string): string {
  const origin = new URL(url).origin;
  return `https://www.google.com/s2/favicons?sz=128&domain_url=${origin}`;
}

/** Download a remote icon and save as png. */
async function downloadIconAsPng(iconUrl: string, targetPath: string): Promise<boolean> {
  try {
    const response = await fetch(iconUrl, { headers: { "user-agent": META_USER_AGENT } });
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
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

    const title = wc.getTitle() || "";
    const description = await wc.executeJavaScript(
      "document.querySelector('meta[name=\"description\"],meta[property=\"og:description\"]')?.content || ''",
      true
    );

    const iconUrl = faviconUrl || buildFallbackIcon(url);
    const [logoOk, previewImage] = await Promise.all([
      downloadIconAsPng(iconUrl, logoPath),
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
