import React, { useState, useRef, useEffect } from "react";
import { useTabs } from "@/hooks/use_tabs";
import { AiChat } from "@/components/page/ai-chat";
import PlantPage from "@/components/page/plant-page";

const MainLayout: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50);
  const dividerRef = useRef<HTMLDivElement>(null);
  const { activeTabId, getTabById } = useTabs();

  const activeTab = activeTabId ? getTabById(activeTabId) : undefined;

  // 组件映射表
  const ComponentMap: Record<string, React.ComponentType<any>> = {
    "ai-chat": AiChat,
    "plant-page": PlantPage,
  };

  // 渲染面板组件
  const renderPanel = (componentName: string, params: Record<string, any>) => {
    const Component = ComponentMap[componentName];
    if (!Component) {
      return (
        <div className="h-full flex items-center justify-center text-muted">
          Component not found: {componentName}
        </div>
      );
    }
    return <Component {...params} />;
  };

  // 确保activeTab的左右面板已经被正确初始化
  const safeActiveTab = activeTab
    ? {
        ...activeTab,
        leftPanel: activeTab.leftPanel || {
          component: "plant-page",
          params: {},
          hidden: false,
        },
        rightPanel: activeTab.rightPanel || {
          component: "ai-chat",
          params: {},
          hidden: false,
        },
      }
    : undefined;

  const handleMouseDown = (_e: React.MouseEvent) => {
    setIsDragging(true);
  };

  const handleMouseMove = (_e: MouseEvent) => {
    if (!isDragging || !dividerRef.current) return;

    const container = dividerRef.current.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newWidth =
      ((_e.clientX - containerRect.left) / containerRect.width) * 100;
    setLeftWidth(Math.max(10, Math.min(90, newWidth)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className="flex h-full  w-full overflow-hidden bg-sidebar">
      {/* 只有当leftPanel不隐藏时才显示 */}
      {safeActiveTab ? (
        <>
          {/* 左侧面板 */}
          <div
            className={`flex flex-col bg-background  rounded-xl max-h-screen transition-all duration-300 ease-in-out overflow-hidden ${
              isDragging ? "transition-none" : ""
            } ${
              safeActiveTab.leftPanel.hidden
                ? "opacity-0 invisible pointer-events-none w-0"
                : "opacity-100 visible pointer-events-auto p-4 pr-2"
            }`}
            style={{
              width: safeActiveTab.leftPanel.hidden
                ? "0%"
                : safeActiveTab.rightPanel.hidden
                ? "100%"
                : `${leftWidth}%`,
            }}
          >
            {renderPanel(
              safeActiveTab.leftPanel.component,
              safeActiveTab.leftPanel.params
            )}
          </div>

          {/* 只有当左右面板都不隐藏时才显示分隔线 */}
          <div
            ref={dividerRef}
            className={`bg-sidebar rounded-4xl cursor-col-resize hover:bg-primary/10 transition-all duration-200 flex items-center justify-center ${
              !safeActiveTab.leftPanel.hidden &&
              !safeActiveTab.rightPanel.hidden
                ? "opacity-100 visible pointer-events-auto w-2 "
                : "opacity-0 invisible pointer-events-none "
            }`}
            onMouseDown={handleMouseDown}
          >
            <div className="w-1 h-6 bg-muted/70 rounded-full" />
          </div>

          {/* 右侧面板 */}
          <div
            className={`bg-background rounded-xl flex-1 transition-all duration-300 ease-in-out overflow-hidden ${
              isDragging ? "transition-none" : ""
            } ${
              safeActiveTab.rightPanel.hidden
                ? "opacity-0 invisible pointer-events-none w-0 "
                : "opacity-100 visible pointer-events-auto  p-4"
            }`}
            style={{
              width: safeActiveTab.leftPanel.hidden ? "100%" : undefined,
            }}
          >
            {renderPanel(
              safeActiveTab.rightPanel.component,
              safeActiveTab.rightPanel.params
            )}
          </div>

          {/* 如果左右面板都隐藏，显示提示信息 */}
          {safeActiveTab.leftPanel.hidden &&
            safeActiveTab.rightPanel.hidden && (
              <div className="w-full h-full flex items-center justify-center text-muted">
                All panels are hidden
              </div>
            )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted">
          No active tab
        </div>
      )}
    </div>
  );
};

export default MainLayout;
