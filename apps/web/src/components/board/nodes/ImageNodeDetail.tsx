/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { OpenLoafImageMetadataV1 } from "@openloaf/api/types/image";
import { cn } from "@/lib/utils";
import { getPreviewEndpoint } from "@/lib/image/uri";
import i18next from "i18next";

/** Preview query flag for metadata. */
const PREVIEW_METADATA_QUERY = "includeMetadata=1";
/** Multipart separator for headers. */
const MULTIPART_HEADER_SEPARATOR = "\r\n\r\n";
/** Multipart line break. */
const MULTIPART_LINE_BREAK = "\r\n";
/** UTF-8 decoder for multipart payloads. */
const TEXT_DECODER = new TextDecoder("utf-8");
/** UTF-8 encoder for multipart payloads. */
const TEXT_ENCODER = new TextEncoder();

export type ImageNodeDetailProps = {
  /** Primary image source used for metadata extraction. */
  source?: string;
  /** Fallback image source when primary is not readable. */
  fallbackSource?: string;
  /** Project id for resolving relative paths. */
  projectId?: string;
  /** Optional wrapper class name. */
  className?: string;
};

type PromptDetail = {
  /** Display label for the prompt. */
  label: string;
  /** Prompt text content. */
  text: string;
};

type PromptDetailCacheEntry = {
  /** Cached prompt detail payload. */
  value: PromptDetail | null;
  /** Cache expiration timestamp. */
  expiresAt: number;
};

/** Cache lifetime for prompt detail requests. */
const PROMPT_DETAIL_CACHE_TTL_MS = 30_000;
/** In-flight prompt detail requests keyed by endpoint set. */
const promptDetailRequestCache = new Map<string, Promise<PromptDetail | null>>();
/** Resolved prompt detail cache keyed by endpoint set. */
const promptDetailResultCache = new Map<string, PromptDetailCacheEntry>();

/** Resolve preview endpoint for metadata extraction. */
function resolveMetadataEndpoint(source?: string, projectId?: string): string | null {
  if (!source) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) return null;
  const base = getPreviewEndpoint(source, { projectId });
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${PREVIEW_METADATA_QUERY}`;
}

/** Build a stable cache key for endpoint lists. */
function buildPromptDetailCacheKey(endpoints: string[]): string {
  return endpoints.join("\n");
}

/** Normalize endpoints for metadata loading and remove duplicates. */
function resolveMetadataEndpoints(
  sources: Array<string | undefined>,
  projectId?: string
): string[] {
  const uniqueEndpoints = new Set<string>();
  for (const source of sources) {
    const endpoint = resolveMetadataEndpoint(source, projectId);
    if (!endpoint) continue;
    uniqueEndpoints.add(endpoint);
  }
  return Array.from(uniqueEndpoints);
}

/** Extract boundary string from content type. */
function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=([^;]+)/i);
  return match?.[1]?.trim().replace(/^"|"$/g, "") ?? null;
}

/** Find a byte pattern inside a buffer. */
function findSubarray(haystack: Uint8Array, needle: Uint8Array, start = 0): number {
  for (let i = start; i <= haystack.length - needle.length; i += 1) {
    let matched = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

/** Parse metadata JSON from multipart/mixed body. */
function parseMultipartMetadata(
  buffer: ArrayBuffer,
  boundary: string
): OpenLoafImageMetadataV1 | null {
  const bytes = new Uint8Array(buffer);
  const boundaryBytes = TEXT_ENCODER.encode(`--${boundary}`);
  const headerSeparatorBytes = TEXT_ENCODER.encode(MULTIPART_HEADER_SEPARATOR);
  const lineBreakBytes = TEXT_ENCODER.encode(MULTIPART_LINE_BREAK);

  const firstBoundary = findSubarray(bytes, boundaryBytes, 0);
  if (firstBoundary < 0) return null;
  let cursor = firstBoundary + boundaryBytes.length;
  if (bytes[cursor] === lineBreakBytes[0] && bytes[cursor + 1] === lineBreakBytes[1]) {
    cursor += lineBreakBytes.length;
  }
  const headerEnd = findSubarray(bytes, headerSeparatorBytes, cursor);
  if (headerEnd < 0) return null;
  const bodyStart = headerEnd + headerSeparatorBytes.length;
  const nextBoundary = findSubarray(bytes, boundaryBytes, bodyStart);
  if (nextBoundary < 0) return null;
  let bodyEnd = nextBoundary;
  if (
    bodyEnd >= lineBreakBytes.length &&
    bytes[bodyEnd - 2] === lineBreakBytes[0] &&
    bytes[bodyEnd - 1] === lineBreakBytes[1]
  ) {
    bodyEnd -= lineBreakBytes.length;
  }
  const jsonText = TEXT_DECODER.decode(bytes.subarray(bodyStart, bodyEnd)).trim();
  if (!jsonText || jsonText === "null") return null;
  try {
    return JSON.parse(jsonText) as OpenLoafImageMetadataV1;
  } catch {
    return null;
  }
}

/** Resolve prompt detail from metadata payload. */
function resolvePromptDetail(metadata: OpenLoafImageMetadataV1 | null): PromptDetail | null {
  if (!metadata) return null;
  if (metadata.revised_prompt?.trim()) {
    return { label: i18next.t('board:imageDetail.revisedPrompt'), text: metadata.revised_prompt.trim() };
  }
  if (metadata.prompt?.trim()) {
    return { label: i18next.t('board:imageDetail.userPrompt'), text: metadata.prompt.trim() };
  }
  return null;
}

/** Load prompt detail from a single metadata endpoint. */
async function loadPromptDetailFromEndpoint(endpoint: string): Promise<PromptDetail | null> {
  // 逻辑：metadata 详情与图片文件一一对应，开发态重复挂载时复用同一请求结果。
  const response = await fetch(endpoint);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/mixed")) return null;
  const boundary = extractBoundary(contentType);
  if (!boundary) return null;
  const buffer = await response.arrayBuffer();
  const metadata = parseMultipartMetadata(buffer, boundary);
  return resolvePromptDetail(metadata);
}

/** Load prompt detail from a preview endpoint list. */
async function loadPromptDetailFromSources(
  sources: Array<string | undefined>,
  projectId?: string
): Promise<PromptDetail | null> {
  const endpoints = resolveMetadataEndpoints(sources, projectId);
  if (endpoints.length === 0) return null;
  const cacheKey = buildPromptDetailCacheKey(endpoints);
  const now = Date.now();
  const cached = promptDetailResultCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const inflight = promptDetailRequestCache.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    for (const endpoint of endpoints) {
      const detail = await loadPromptDetailFromEndpoint(endpoint);
      if (detail) return detail;
    }
    return null;
  })();

  promptDetailRequestCache.set(cacheKey, request);
  try {
    const detail = await request;
    promptDetailResultCache.set(cacheKey, {
      value: detail,
      expiresAt: now + PROMPT_DETAIL_CACHE_TTL_MS,
    });
    return detail;
  } finally {
    promptDetailRequestCache.delete(cacheKey);
  }
}

/** Render a readonly detail panel for image metadata. */
export function ImageNodeDetail({
  source,
  fallbackSource,
  className,
  projectId,
}: ImageNodeDetailProps) {
  const [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null);
  const sources = useMemo(() => [source, fallbackSource], [fallbackSource, source]);

  useEffect(() => {
    let cancelled = false;
    setPromptDetail(null);
    void (async () => {
      try {
        const detail = await loadPromptDetailFromSources(sources, projectId);
        if (cancelled) return;
        setPromptDetail(detail);
      } catch {
        if (cancelled) return;
        setPromptDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sources]);

  if (!promptDetail?.text) return null;

  return (
    <div
      className={cn(
        "relative h-[94px] w-[360px] rounded-3xl border border-border bg-card shadow-sm",
        className
      )}
      data-board-editor
    >
      <div className="flex h-full flex-col gap-1 px-2 pt-2 pb-2">
        <div className="text-[11px] font-medium text-muted-foreground/80">
          {promptDetail.label}
        </div>
        <div className="flex-1 overflow-auto text-[13px] leading-5 text-foreground whitespace-pre-wrap break-words">
          {promptDetail.text}
        </div>
      </div>
    </div>
  );
}
