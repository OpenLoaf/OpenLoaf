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

import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { ViewerGuard } from "@/components/file/lib/viewer-guard";

interface FileViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
  /** Chat session id — required when uri contains ${CURRENT_CHAT_DIR} template. */
  sessionId?: string;
  rootUri?: string;
}

/** Extensions that should not be rendered as plain text. */
const BINARY_PREVIEW_EXTS = new Set([
  "7z",
  "aab",
  "aep",
  "accdb",
  "ai",
  "apk",
  "app",
  "asset",
  "bin",
  "blend",
  "bz2",
  "cab",
  "c4d",
  "cdr",
  "ckpt",
  "dat",
  "db",
  "der",
  "dmg",
  "doc",
  "dll",
  "dylib",
  "ear",
  "epub",
  "eps",
  "exe",
  "feather",
  "fig",
  "fla",
  "gz",
  "h5",
  "hdf5",
  "img",
  "indd",
  "ipa",
  "iso",
  "jar",
  "keystore",
  "lz",
  "lz4",
  "max",
  "mdb",
  "msi",
  "mobi",
  "npz",
  "npy",
  "onnx",
  "orc",
  "otf",
  "pak",
  "parquet",
  "pb",
  "pfx",
  "p12",
  "pt",
  "pth",
  "pkg",
  "prproj",
  "psb",
  "psd",
  "qcow2",
  "rar",
  "rpm",
  "safetensors",
  "sketch",
  "so",
  "sqlite",
  "sqlite3",
  "swf",
  "sys",
  "tar",
  "tgz",
  "ttf",
  "uasset",
  "umap",
  "unity3d",
  "vhd",
  "vhdx",
  "vmdk",
  "vpk",
  "war",
  "wad",
  "woff",
  "woff2",
  "xapk",
  "xd",
  "xz",
  "zip",
  "zst",
]);

/** Check whether the file extension should use the binary fallback UI. */
function shouldUseBinaryFallback(ext?: string): boolean {
  return Boolean(ext && BINARY_PREVIEW_EXTS.has(ext.toLowerCase()));
}

/** Build a friendly "not supported" message; interpolate the extension when known. */
function buildUnsupportedMessage(ext?: string): string {
  const normalized = ext?.toLowerCase().trim();
  if (normalized) return `当前程序不支持 .${normalized} 格式的文件`;
  return "当前程序不支持该文件类型";
}

/** Heuristic: detect if a text sample looks like binary garbage. */
function looksLikeBinary(sample: string): boolean {
  if (!sample) return false;
  const slice = sample.slice(0, 1000);
  if (slice.length < 16) return false;
  let nonPrintable = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const code = slice.charCodeAt(i);
    // 允许常见空白：\t \n \r 和换页/垂直制表符
    if (code === 9 || code === 10 || code === 13 || code === 11 || code === 12) continue;
    // 可打印 ASCII
    if (code >= 32 && code <= 126) continue;
    // Unicode 字符（> 127）放行 — 避免误判中文/日文等
    if (code > 127) continue;
    nonPrintable += 1;
  }
  return nonPrintable / slice.length > 0.3;
}

/** Render a simple file preview panel. */
export default function FileViewer({ uri, name, ext, projectId, sessionId, rootUri }: FileViewerProps) {
  const resolvedExt = ext ?? name?.split(".").pop();
  // 逻辑：二进制文件不走文本读取，直接提示使用系统程序或下载查看。
  const isBinaryFallback = shouldUseBinaryFallback(resolvedExt);
  const fsRootUri = !projectId && rootUri ? rootUri : undefined;
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      uri && !isBinaryFallback ? { projectId, sessionId, rootUri: fsRootUri, uri } : skipToken
    )
  );

  const content = fileQuery.data?.content ?? "";
  // 逻辑：未进入白名单但内容实际是二进制时，降级到不支持面板。
  const contentLooksBinary =
    !isBinaryFallback && !fileQuery.isLoading && !fileQuery.isError && looksLikeBinary(content);
  const shouldShowNotSupported = isBinaryFallback || contentLooksBinary;

  if (
    !uri ||
    fileQuery.isLoading ||
    fileQuery.data?.tooLarge ||
    shouldShowNotSupported ||
    fileQuery.isError
  ) {
    return (
      <ViewerGuard
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        loading={fileQuery.isLoading}
        tooLarge={fileQuery.data?.tooLarge}
        notSupported={shouldShowNotSupported}
        forceAction={shouldShowNotSupported}
        error={fileQuery.isError}
        errorDetail={fileQuery.error}
        errorMessage={shouldShowNotSupported ? buildUnsupportedMessage(resolvedExt) : undefined}
        errorDescription={
          shouldShowNotSupported ? "建议使用系统程序打开或下载后查看。" : undefined
        }
      >
        {null}
      </ViewerGuard>
    );
  }

  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="mb-3 text-sm text-muted-foreground truncate">
        {name ?? uri}
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-6">{content}</pre>
    </div>
  );
}
