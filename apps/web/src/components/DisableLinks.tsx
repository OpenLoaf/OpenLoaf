"use client";

import { useEffect } from "react";
import { BROWSER_WINDOW_COMPONENT, BROWSER_WINDOW_PANEL_ID } from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";

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

      // Block navigation and open in stack
      e.preventDefault();
      e.stopPropagation();

      const { activeTabId } = useTabs.getState();
      const { pushStackItem } = useTabRuntime.getState();

      if (activeTabId) {
        // Use the text content as title, or fallback to href
        // Clean up title if it's too long? Maybe just take it as is.
        let title = anchor.textContent?.trim() || href;
        if (title.length > 50) title = title.substring(0, 47) + "...";

        pushStackItem(
          activeTabId,
          {
            id: BROWSER_WINDOW_PANEL_ID,
            sourceKey: BROWSER_WINDOW_PANEL_ID,
            component: BROWSER_WINDOW_COMPONENT,
            title: title,
            params: { __customHeader: true, __open: { url: href, title } },
          } as any,
          70
        );
      } else {
        console.warn("GlobalLinkHandler: No active tab found to open link.");
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
