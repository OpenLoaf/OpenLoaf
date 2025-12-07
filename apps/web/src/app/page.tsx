"use client";
import { useEffect, useRef, useState } from "react";
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
  const [hydrated, setHydrated] = useState(false);
  const {
    leftOpen,
    rightOpen,
    setLeftOpen,
    setRightOpen,
    setLeftPanelWidth,
    setRightPanelWidth,
    leftPanelWidth,
    rightPanelWidth,
  } = useSidebar();
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const lastLeftSize = useRef(leftPanelWidth);
  const lastRightSize = useRef(rightPanelWidth);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // 组件初始化时设置初始宽度和状态
  useEffect(() => {
    if (!hydrated) return;

    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    if (!leftPanel || !rightPanel) return;

    // 从 store 中获取保存的宽度
    lastLeftSize.current = leftPanelWidth;
    lastRightSize.current = rightPanelWidth;

    // 根据保存的状态设置侧边栏展开/折叠
    if (leftOpen) {
      leftPanel.expand(Math.max(leftPanelWidth, MIN_LEFT));
    } else {
      leftPanel.collapse();
    }

    if (rightOpen) {
      rightPanel.expand(Math.max(rightPanelWidth, MIN_RIGHT));
    } else {
      rightPanel.collapse();
    }
  }, [hydrated, leftOpen, rightOpen, leftPanelWidth, rightPanelWidth]);

  // 监听左侧边栏状态变化
  useEffect(() => {
    if (!hydrated) return;

    const leftPanel = leftPanelRef.current;
    if (!leftPanel) return;

    if (leftOpen) {
      leftPanel.expand(Math.max(lastLeftSize.current, MIN_LEFT));
    } else {
      lastLeftSize.current = Math.max(leftPanel.getSize(), MIN_LEFT);
      setLeftPanelWidth(lastLeftSize.current);
      leftPanel.collapse();
    }
  }, [hydrated, leftOpen, setLeftPanelWidth]);

  // 监听右侧边栏状态变化
  useEffect(() => {
    if (!hydrated) return;

    const rightPanel = rightPanelRef.current;
    if (!rightPanel) return;

    if (rightOpen) {
      rightPanel.expand(Math.max(lastRightSize.current, MIN_RIGHT));
    } else {
      lastRightSize.current = Math.max(rightPanel.getSize(), MIN_RIGHT);
      setRightPanelWidth(lastRightSize.current);
      rightPanel.collapse();
    }
  }, [hydrated, rightOpen, setRightPanelWidth]);

  const handleLayout = (sizes: number[]) => {
    if (leftOpen) {
      lastLeftSize.current = Math.max(sizes[0], MIN_LEFT);
      setLeftPanelWidth(lastLeftSize.current);
    }
    if (rightOpen) {
      lastRightSize.current = Math.max(sizes[2], MIN_RIGHT);
      setRightPanelWidth(lastRightSize.current);
    }
  };

  if (!hydrated) return null;

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex-1 pb-1 bg-sidebar">
        <PanelGroup
          direction="horizontal"
          className="flex flex-1 h-full"
          onLayout={handleLayout}
        >
          <Panel
            ref={leftPanelRef}
            defaultSize={leftPanelWidth}
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
          <Panel minSize={32}>
            <div className="h-full p-4 bg-background border rounded-lg">
              <h1 className="text-xl font-bold mb-4">Editor</h1>
              <div className="h-[calc(100%-2rem)] rounded border p-4">
                Editor placeholder
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-2 cursor-col-resize bg-sidebar hover:bg-gray-300" />
          <Panel
            ref={rightPanelRef}
            defaultSize={rightPanelWidth}
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
