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

import { Minus, Square, X } from "lucide-react";

/** Frameless 窗口的自定义最小化/最大化/关闭按钮（Linux 使用）。 */
export const WindowControls = () => {
  const api = typeof window !== "undefined" ? window.openloafElectron : undefined;
  if (!api?.minimizeWindow || !api.toggleMaximizeWindow || !api.closeWindow) return null;

  const baseBtn =
    "flex h-7 w-7 rounded-full items-center justify-center text-foreground/70 transition-colors";
  return (
    <div
      data-no-drag="true"
      className="flex items-center gap-0.5 h-(--header-height) pl-1 pr-1"
    >
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => api.minimizeWindow?.()}
        className={`${baseBtn} hover:bg-foreground/10 hover:text-foreground`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Maximize"
        onClick={() => api.toggleMaximizeWindow?.()}
        className={`${baseBtn} hover:bg-foreground/10 hover:text-foreground`}
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => api.closeWindow?.()}
        className={`${baseBtn} hover:bg-red-500 hover:text-white`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
