"use client";

import { useEffect, useMemo, useState } from "react";
import type { TenasImageMetadataV1 } from "@tenas-ai/api/types/image";
import { cn } from "@/lib/utils";
import { getPreviewEndpoint } from "@/lib/image/uri";

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
  /** Optional wrapper class name. */
  className?: string;
};

type PromptDetail = {
  /** Display label for the prompt. */
  label: string;
  /** Prompt text content. */
  text: string;
};

/** Resolve preview endpoint for metadata extraction. */
function resolveMetadataEndpoint(source?: string): string | null {
  if (!source || !source.startsWith("tenas-file://")) return null;
  const base = getPreviewEndpoint(source);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${PREVIEW_METADATA_QUERY}`;
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
): TenasImageMetadataV1 | null {
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
    return JSON.parse(jsonText) as TenasImageMetadataV1;
  } catch {
    return null;
  }
}

/** Resolve prompt detail from metadata payload. */
function resolvePromptDetail(metadata: TenasImageMetadataV1 | null): PromptDetail | null {
  if (!metadata) return null;
  if (metadata.revised_prompt?.trim()) {
    return { label: "改写提示词", text: metadata.revised_prompt.trim() };
  }
  if (metadata.prompt?.trim()) {
    return { label: "用户提示词", text: metadata.prompt.trim() };
  }
  return null;
}

/** Load prompt detail from a preview endpoint list. */
async function loadPromptDetailFromSources(
  sources: Array<string | undefined>
): Promise<PromptDetail | null> {
  for (const source of sources) {
    const endpoint = resolveMetadataEndpoint(source);
    if (!endpoint) continue;
    // 逻辑：仅在预览接口返回 multipart/mixed 时解析元信息。
    const response = await fetch(endpoint);
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/mixed")) continue;
    const boundary = extractBoundary(contentType);
    if (!boundary) continue;
    const buffer = await response.arrayBuffer();
    const metadata = parseMultipartMetadata(buffer, boundary);
    const detail = resolvePromptDetail(metadata);
    if (detail) return detail;
  }
  return null;
}

/** Render a readonly detail panel for image metadata. */
export function ImageNodeDetail({ source, fallbackSource, className }: ImageNodeDetailProps) {
  const [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null);
  const sources = useMemo(() => [source, fallbackSource], [fallbackSource, source]);

  useEffect(() => {
    let cancelled = false;
    setPromptDetail(null);
    void (async () => {
      try {
        const detail = await loadPromptDetailFromSources(sources);
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
  }, [sources]);

  if (!promptDetail?.text) return null;

  return (
    <div
      className={cn(
        "relative h-[94px] w-[360px] rounded-xl border border-border bg-card shadow-lg",
        className
      )}
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
