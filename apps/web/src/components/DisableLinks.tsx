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

import { useEffect } from "react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@openloaf/api/common";
import { useLayoutState } from "@/hooks/use-layout-state";
import { isElectronEnv } from "@/utils/is-electron-env";

export function DisableLinks() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");

      if (!anchor) return;

      const href = anchor.href;
      const rawHref = anchor.getAttribute("href");

      if (!href || !rawHref) return;
      // Allow internal hash links
      if (rawHref.startsWith("#")) return;

      // 逻辑：非 Electron 环境直接打开新标签页，不走内置浏览器面板。
      if (!isElectronEnv()) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }

      // Block navigation and open in stack
      e.preventDefault();
      e.stopPropagation();

      // Use the text content as title, or fallback to href
      let title = anchor.textContent?.trim() || href;
      if (title.length > 50) title = title.substring(0, 47) + "...";

      useLayoutState.getState().pushStackItem(
        {
          id: BROWSER_WINDOW_PANEL_ID,
          sourceKey: BROWSER_WINDOW_PANEL_ID,
          component: BROWSER_WINDOW_COMPONENT,
          title: title,
          params: { __customHeader: true, __open: { url: href, title } },
        } as any,
        70
      );
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
