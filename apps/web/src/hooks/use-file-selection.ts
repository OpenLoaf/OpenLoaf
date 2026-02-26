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

import { useCallback, useState } from "react";

/** Selection update mode. */
export type SelectionMode = "replace" | "toggle";

/** Manage file selection state for grid interactions. */
export function useFileSelection() {
  /** Selected entry uris. */
  const [selectedUris, setSelectedUris] = useState<Set<string>>(() => new Set());

  /** Replace current selection with next uris. */
  const replaceSelection = useCallback((uris: string[]) => {
    // 中文注释：用新的集合覆盖当前选中。
    setSelectedUris(new Set(uris));
  }, []);

  /** Toggle selection for a single uri. */
  const toggleSelection = useCallback((uri: string) => {
    setSelectedUris((prev) => {
      const next = new Set(prev);
      // 中文注释：已选中则移除，否则加入。
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  }, []);

  /** Ensure the uri is included in selection. */
  const ensureSelected = useCallback((uri: string) => {
    setSelectedUris((prev) => {
      if (prev.has(uri)) return prev;
      // 中文注释：保留既有选择并补充当前项。
      const next = new Set(prev);
      next.add(uri);
      return next;
    });
  }, []);

  /** Clear all selections. */
  const clearSelection = useCallback(() => {
    // 中文注释：清空选中用于空白处交互。
    setSelectedUris(new Set());
  }, []);

  /** Apply drag selection results with a mode. */
  const applySelectionChange = useCallback(
    (uris: string[], mode: SelectionMode) => {
      setSelectedUris((prev) => {
        const next = mode === "toggle" ? new Set(prev) : new Set<string>();
        // 中文注释：按模式合并拖拽命中条目。
        for (const uri of uris) {
          if (mode === "toggle") {
            if (next.has(uri)) {
              next.delete(uri);
            } else {
              next.add(uri);
            }
          } else {
            next.add(uri);
          }
        }
        return next;
      });
    },
    []
  );

  return {
    selectedUris,
    replaceSelection,
    toggleSelection,
    ensureSelected,
    clearSelection,
    applySelectionChange,
  };
}
