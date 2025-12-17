"use client";

import { useEffect } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { generateId } from "ai";

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

      const { activeTabId, pushStackItem } = useTabs.getState();

      if (activeTabId) {
        // Use the text content as title, or fallback to href
        // Clean up title if it's too long? Maybe just take it as is.
        let title = anchor.textContent?.trim() || href;
        if (title.length > 50) title = title.substring(0, 47) + "...";

        pushStackItem(activeTabId, {
          id: generateId(),
          component: "electron-browser-window",
          title: title,
          params: { url: href },
        } as any);
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
