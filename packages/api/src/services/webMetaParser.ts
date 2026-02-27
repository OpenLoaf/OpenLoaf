/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type WebMetadata = {
  /** Page title text. */
  title: string;
  /** Page description text. */
  description: string;
  /** Icon URL resolved for the page. */
  iconUrl: string;
};

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
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    attrs[name] = value;
  }
  return attrs;
}

/** Extract meta tag content for matching names/properties. */
function extractMetaContent(html: string, keys: string[]): string {
  const pattern = /<meta\s+[^>]*>/gi;
  const candidates = keys.map((key) => key.toLowerCase());
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
  const match = html.match(
    /<base\s+[^>]*href\s*=\s*(".*?"|'.*?'|[^'"\s>]+)[^>]*>/i
  );
  if (!match) return "";
  let href = match[1] ?? "";
  if (
    (href.startsWith("\"") && href.endsWith("\"")) ||
    (href.startsWith("'") && href.endsWith("'"))
  ) {
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
    if (!relTokens.some((token) => token.includes("icon"))) continue;
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

/** Parse metadata from HTML and resolve icon URLs. */
export function parseWebMetadataFromHtml(html: string, url: string): WebMetadata {
  if (!html) {
    return { title: "", description: "", iconUrl: "" };
  }
  const baseHref = extractBaseHref(html);
  let baseUrl = url;
  if (baseHref) {
    try {
      baseUrl = new URL(baseHref, url).toString();
    } catch {
      baseUrl = url;
    }
  }
  const title = extractTitle(html);
  const description = extractDescription(html);
  const iconUrl = extractIconHref(html, baseUrl);
  return { title, description, iconUrl };
}
