/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { ReadFileErrorFallback } from "@/components/file/lib/read-file-error";

interface FileViewerProps {
  uri?: string;
  name?: string;
  ext?: string;
  projectId?: string;
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

/** Render a simple file preview panel. */
export default function FileViewer({ uri, name, ext, projectId, rootUri }: FileViewerProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const resolvedExt = ext ?? name?.split(".").pop();
  // 逻辑：二进制文件不走文本读取，直接提示使用系统程序或下载查看。
  const isBinaryFallback = shouldUseBinaryFallback(resolvedExt);
  const fileQuery = useQuery(
    trpc.fs.readFile.queryOptions(
      uri && workspaceId && !isBinaryFallback ? { workspaceId, projectId, uri } : skipToken
    )
  );

  if (!uri) {
    return <div className="h-full w-full p-4 text-muted-foreground">未选择文件</div>;
  }

  if (fileQuery.isLoading) {
    return <div className="h-full w-full p-4 text-muted-foreground">加载中…</div>;
  }

  if (fileQuery.data?.tooLarge) {
    return (
      <ReadFileErrorFallback
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        tooLarge
      />
    );
  }

  if (isBinaryFallback) {
    return (
      <ReadFileErrorFallback
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        forceAction
        message="当前程序不支持该文件类型"
        description="建议使用系统程序打开或下载后查看。"
      />
    );
  }

  if (fileQuery.isError) {
    return (
      <ReadFileErrorFallback
        uri={uri}
        name={name}
        projectId={projectId}
        rootUri={rootUri}
        error={fileQuery.error}
      />
    );
  }

  const content = fileQuery.data?.content ?? "";

  return (
    <div className="h-full w-full p-4 overflow-auto">
      <div className="mb-3 text-sm text-muted-foreground truncate">
        {name ?? uri}
      </div>
      <pre className="whitespace-pre-wrap text-sm leading-6">{content}</pre>
    </div>
  );
}
