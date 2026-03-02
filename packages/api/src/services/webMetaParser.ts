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

/**
 * Find all occurrences of a self-closing HTML tag (e.g. <meta ...>, <link ...>).
 * Uses indexOf scanning instead of regex to avoid ReDoS on crafted input.
 */
function findSelfClosingTags(html: string, tagName: string): string[] {
  const tags: string[] = [];
  const needle = `<${tagName}`;
  const needleLen = needle.length;
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const start = lower.indexOf(needle, pos);
    if (start === -1) break;
    // Ensure it's a real tag boundary (followed by whitespace or >)
    const ch = lower[start + needleLen];
    if (ch !== undefined && ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r" && ch !== ">" && ch !== "/") {
      pos = start + 1;
      continue;
    }
    const end = html.indexOf(">", start);
    if (end === -1) break;
    tags.push(html.slice(start, end + 1));
    pos = end + 1;
  }
  return tags;
}

/** Parse attributes from a single HTML tag string using non-backtracking regex. */
function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Use [^"]* and [^']* instead of .*? to prevent backtracking
  const attrPattern = /([a-zA-Z:-]+)\s*=\s*("[^"]*"|'[^']*'|[^'"\s>]+)/g;
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
  const candidates = keys.map((key) => key.toLowerCase());
  for (const tag of findSelfClosingTags(html, "meta")) {
    const attrs = parseTagAttributes(tag);
    const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
    if (!name || !candidates.includes(name)) continue;
    const content = attrs.content ?? "";
    if (content) return normalizeText(content);
  }
  return "";
}

/** Extract the document title from HTML using indexOf (no regex). */
function extractTitle(html: string): string {
  const metaTitle = extractMetaContent(html, ["og:title", "twitter:title", "title"]);
  if (metaTitle) return metaTitle;
  const lower = html.toLowerCase();
  const openStart = lower.indexOf("<title");
  if (openStart === -1) return "";
  const openEnd = html.indexOf(">", openStart);
  if (openEnd === -1) return "";
  const closeStart = lower.indexOf("</title>", openEnd);
  if (closeStart === -1) return "";
  const rawTitle = html.slice(openEnd + 1, closeStart);
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
  const tags = findSelfClosingTags(html, "base");
  if (tags.length === 0) return "";
  const attrs = parseTagAttributes(tags[0] as string);
  return (attrs.href ?? "").trim();
}

/** Resolve an icon URL from link tags. */
function extractIconHref(html: string, baseUrl: string): string {
  for (const tag of findSelfClosingTags(html, "link")) {
    const attrs = parseTagAttributes(tag);
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
  // Limit input size — metadata lives in <head>, no need to scan full document
  const MAX_HTML_LEN = 100_000;
  if (html.length > MAX_HTML_LEN) {
    html = html.slice(0, MAX_HTML_LEN);
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
