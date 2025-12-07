"use client";
import { useState, useEffect } from "react";

import Header from "@/components/layout/header";
import SidebarLeft from "@/components/layout/sidebar-left";
import SidebarRight from "@/components/layout/sidebar-right";
import Editor from "@/components/page/plant-page";
import { AiChat } from "@/components/page/ai-chat";
import { useSidebar, useSidebarResize } from "@/hooks/use-sidebar";
import { useTabs } from "@/hooks/use_tabs";

export default function Home() {
  const { leftOpen, rightOpen } = useSidebar();
  const {
    containerRef,
    isResizing,
    layoutStyle,
    handleLeftHandleDown,
    handleRightHandleDown,
  } = useSidebarResize();
  const { activeTabId, getTabById } = useTabs();

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  const activeTab = activeTabId ? getTabById(activeTabId) : undefined;

  const renderContent = () => {
    if (!activeTab) {
      return <Editor />;
    }

    switch (activeTab.type) {
      case "page":
        return <Editor />;
      case "chat":
        return <AiChat />;
      default:
        return <Editor />;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 pb-1 bg-sidebar">
        <div
          ref={containerRef}
          className={`workbench-grid h-full ${isResizing ? "is-resizing" : ""}`}
          style={layoutStyle}
        >
          <div
            className={`sidebar-animation h-full ${
              leftOpen ? "sidebar-expanded" : "sidebar-collapsed"
            }`}
          >
            <SidebarLeft />
          </div>
          <div
            className="resize-handle"
            onPointerDown={handleLeftHandleDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize left panel"
          />
          {renderContent()}
          <div
            className="resize-handle"
            onPointerDown={handleRightHandleDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize right panel"
          />
          <div
            className={`sidebar-animation sidebar-right-panel h-full ${
              rightOpen ? "sidebar-expanded" : "sidebar-collapsed"
            }`}
          >
            <SidebarRight />
          </div>
        </div>
      </div>
    </div>
  );
}
