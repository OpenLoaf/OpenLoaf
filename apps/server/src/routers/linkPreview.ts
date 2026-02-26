/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { BaseLinkPreviewRouter, linkPreviewSchemas, t, shieldedProcedure } from "@openloaf/api";
import type { Response } from "undici";

/** Timeout for fetching HTML content. */
const DEFAULT_TIMEOUT_MS = 8000;
/** Maximum bytes to read from HTML responses. */
const MAX_HTML_BYTES = 512 * 1024;
/** User agent for link preview fetches. */
const PREVIEW_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type LinkMetadata = {
  /** Page title text. */
  title: string;
  /** Page description text. */
  description: string;
  /** Icon URL resolved for the page. */
  iconUrl: string;
};

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
      // 逻辑：超出限制时截断并停止读取，避免占用过多内存。
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

/** Decode basic HTML entities in extracted text. */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, raw) => {
    const entity = String(raw).toLowerCase();
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return "\"";
    if (entity === "apos" || entity === "#39") return "'";
    if (entity.startsWith("#x")) {
      const code = parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    }
    if (entity.startsWith("#")) {
      const code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    }
    return "";
  });
}

/** Normalize whitespace in extracted text. */
function normalizeText(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

/** Parse attributes from a single HTML tag. */
function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrPattern = /([a-zA-Z:-]+)\s*=\s*(".*?"|'.*?'|[^'"\s>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(tag))) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    let value = match[2] ?? "";
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    attrs[name] = value;
  }
  return attrs;
}

/** Extract meta tag content for matching names/properties. */
function extractMetaContent(html: string, keys: string[]): string {
  const pattern = /<meta\s+[^>]*>/gi;
  const candidates = keys.map(key => key.toLowerCase());
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const attrs = parseTagAttributes(match[0]);
    const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
    if (!name || !candidates.includes(name)) continue;
    const content = attrs.content ?? "";
    if (content) return normalizeText(content);
  }
  return "";
}

/** Extract the document title from HTML. */
function extractTitle(html: string): string {
  const metaTitle = extractMetaContent(html, ["og:title", "twitter:title", "title"]);
  if (metaTitle) return metaTitle;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle = match?.[1];
  return rawTitle ? normalizeText(rawTitle) : "";
}

/** Extract description text from HTML. */
function extractDescription(html: string): string {
  return extractMetaContent(html, [
    "description",
    "og:description",
    "twitter:description",
  ]);
}

/** Extract the base href for resolving relative URLs. */
function extractBaseHref(html: string): string {
  const match = html.match(/<base\s+[^>]*href\s*=\s*(".*?"|'.*?'|[^'"\s>]+)[^>]*>/i);
  if (!match) return "";
  let href = match[1] ?? "";
  if ((href.startsWith("\"") && href.endsWith("\"")) || (href.startsWith("'") && href.endsWith("'"))) {
    href = href.slice(1, -1);
  }
  return href.trim();
}

/** Resolve an icon URL from link tags. */
function extractIconHref(html: string, baseUrl: string): string {
  const pattern = /<link\s+[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const attrs = parseTagAttributes(match[0]);
    const rel = (attrs.rel ?? "").toLowerCase();
    if (!rel) continue;
    const relTokens = rel.split(/\s+/);
    if (!relTokens.some(token => token.includes("icon"))) continue;
    const href = attrs.href ?? "";
    if (!href) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return "";
}

/** Build a fallback icon URL from the page origin. */
function buildFallbackIcon(url: string): string {
  const origin = new URL(url).origin;
  return `https://www.google.com/s2/favicons?sz=128&domain_url=${origin}`;
}

/** Fetch HTML and extract link metadata. */
async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": PREVIEW_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      // 逻辑：非 HTML 或请求失败时直接走兜底信息。
      return {
        title: "",
        description: "",
        iconUrl: buildFallbackIcon(url),
      };
    }
    const html = await readTextWithLimit(response, MAX_HTML_BYTES);
    const baseHref = extractBaseHref(html);
    let baseUrl = url;
    if (baseHref) {
      try {
        baseUrl = new URL(baseHref, url).toString();
      } catch {
        // 逻辑：base 标签非法时回退到原始 URL。
        baseUrl = url;
      }
    }
    const title = extractTitle(html);
    const description = extractDescription(html);
    const iconUrl = extractIconHref(html, baseUrl) || buildFallbackIcon(url);
    return { title, description, iconUrl };
  } catch {
    // 逻辑：捕获网络异常，保持返回结构完整。
    return {
      title: "",
      description: "",
      iconUrl: buildFallbackIcon(url),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export class LinkPreviewRouterImpl extends BaseLinkPreviewRouter {
  /** Link preview router implementation. */
  public static createRouter() {
    return t.router({
      capture: shieldedProcedure
        .input(linkPreviewSchemas.capture.input)
        .output(linkPreviewSchemas.capture.output)
        .mutation(async ({ input }) => {
          const result = await fetchLinkMetadata(input.url);
          return {
            ok: true,
            imageUrl: result.iconUrl,
            title: result.title || undefined,
            description: result.description || undefined,
          };
        }),
    });
  }
}

export const linkPreviewRouterImplementation = LinkPreviewRouterImpl.createRouter();
