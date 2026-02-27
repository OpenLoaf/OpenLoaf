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

import { memo } from "react";
import { openFilePreview } from "@/components/file/lib/open-file";
import type { FileSystemEntry } from "../utils/file-system-utils";

export type FileSystemEntryPreviewContentProps = {
  /** Entry to preview. */
  entry: FileSystemEntry;
  /** Optional root uri for path resolution. */
  rootUri?: string;
  /** Project id for file access. */
  projectId?: string;
  /** Whether preview should be read-only. */
  readOnly?: boolean;
};

/** Render preview content for file system entries. */
const FileSystemEntryPreviewContent = memo(function FileSystemEntryPreviewContent({
  entry,
  rootUri,
  projectId,
  readOnly,
}: FileSystemEntryPreviewContentProps) {
  const content = openFilePreview({
    entry,
    rootUri,
    projectId,
    readOnly,
    mode: "embed",
  });
  return <>{content}</>;
});

FileSystemEntryPreviewContent.displayName = "FileSystemEntryPreviewContent";

export { FileSystemEntryPreviewContent };
