"use client";
import { useRef, useEffect } from "react";
import {
  type ImperativePanelHandle,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";

import Header from "@/components/layout/header";
import SidebarLeft from "@/components/layout/sidebar-left";
import SidebarRight from "@/components/layout/sidebar-right";
import { useSidebar } from "@/hooks/use-sidebar";

const BASE_LAYOUT = [18, 56, 22] satisfies number[];
const MIN_LEFT = 12;
const MIN_RIGHT = 14;

export default function Home() {
  const { leftOpen, rightOpen, setLeftOpen, setRightOpen, setLeftPanelWidth } =
    useSidebar();
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const lastLeftSize = useRef(BASE_LAYOUT[0]);
  const lastRightSize = useRef(BASE_LAYOUT[2]);

  // 监听左侧边栏状态变化
  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    if (!leftPanel) return;

    if (leftOpen) {
      leftPanel.expand(Math.max(lastLeftSize.current, MIN_LEFT));
    } else {
      lastLeftSize.current = Math.max(leftPanel.getSize(), MIN_LEFT);
      leftPanel.collapse();
    }
  }, [leftOpen]);

  // 监听右侧边栏状态变化
  useEffect(() => {
    const rightPanel = rightPanelRef.current;
    if (!rightPanel) return;

    if (rightOpen) {
      rightPanel.expand(Math.max(lastRightSize.current, MIN_RIGHT));
    } else {
      lastRightSize.current = Math.max(rightPanel.getSize(), MIN_RIGHT);
      rightPanel.collapse();
    }
  }, [rightOpen]);

  const handleLayout = (sizes: number[]) => {
    if (leftOpen) lastLeftSize.current = Math.max(sizes[0], MIN_LEFT);
    if (rightOpen) lastRightSize.current = Math.max(sizes[2], MIN_RIGHT);
    setLeftPanelWidth(sizes[0]);
  };

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 mb-2">
        <PanelGroup
          direction="horizontal"
          className="flex flex-1 h-full"
          onLayout={handleLayout}
        >
          <Panel
            ref={leftPanelRef}
            defaultSize={BASE_LAYOUT[0]}
            minSize={MIN_LEFT}
            maxSize={30}
            collapsible
            collapsedSize={0}
            onCollapse={() => setLeftOpen(false)}
            onExpand={() => setLeftOpen(true)}
          >
            <SidebarLeft />
          </Panel>
          <PanelResizeHandle className="w-2 cursor-col-resize bg-sidebar hover:bg-gray-300" />
          <Panel defaultSize={BASE_LAYOUT[1]} minSize={32}>
            <div className="h-full p-4 bg-white border rounded-lg">
              <h1 className="text-xl font-bold mb-4">Editor</h1>
              <div className="h-[calc(100%-2rem)] bg-gray-50 rounded border p-4">
                Editor placeholder
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-2 cursor-col-resize bg-sidebar hover:bg-gray-300" />
          <Panel
            ref={rightPanelRef}
            defaultSize={BASE_LAYOUT[2]}
            minSize={MIN_RIGHT}
            maxSize={50}
            collapsible
            collapsedSize={0}
            onCollapse={() => setRightOpen(false)}
            onExpand={() => setRightOpen(true)}
          >
            <SidebarRight />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
