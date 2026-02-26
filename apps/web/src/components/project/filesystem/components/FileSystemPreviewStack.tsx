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

import { memo, type ReactNode } from "react";

export type FileSystemPreviewStackProps = {
  /** Main content area for list/columns. */
  content: ReactNode;
  /** Preview panel element. */
  preview: ReactNode | null;
  /** Optional overlay element. */
  overlay?: ReactNode;
  /** Additional class name for the stack. */
  className?: string;
};

/** Layout container for list/column preview stacks. */
const FileSystemPreviewStack = memo(function FileSystemPreviewStack({
  content,
  preview,
  overlay,
  className,
}: FileSystemPreviewStackProps) {
  return (
    <div className={`relative flex min-h-full h-full overflow-hidden ${className ?? ""}`}>
      {overlay}
      {content}
      {preview}
    </div>
  );
});

FileSystemPreviewStack.displayName = "FileSystemPreviewStack";

export { FileSystemPreviewStack };
