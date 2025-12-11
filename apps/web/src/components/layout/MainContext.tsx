import React, { useState, useRef, useEffect } from "react";
import { useTabs } from "@/hooks/use_tabs";
import PlantPage from "@/components/plant/Plant";
import { Chat } from "../chat/Chat";
import { cn } from "@/lib/utils";

export const MainContent: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [leftWidth, setLeftWidth] = useState(50);
  const dividerRef = useRef<HTMLDivElement>(null);
  const { activeLeftPanel, activeRightPanel } = useTabs();

  const hasLeftPanel = Boolean(activeLeftPanel);
  const hasRightPanel = Boolean(activeRightPanel);
  const leftHidden = activeLeftPanel?.hidden ?? false;
  const rightHidden = activeRightPanel?.hidden ?? false;

  // 组件映射表
  const ComponentMap: Record<string, React.ComponentType<any>> = {
    "ai-chat": Chat,
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
    setLeftWidth(Math.max(30, Math.min(70, newWidth)));
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
    <div
      className={cn("flex h-full w-full overflow-hidden bg-sidebar", className)}
    >
      {hasLeftPanel || hasRightPanel ? (
        <>
          {/* 左侧面板 */}
          {activeLeftPanel && (
            <div
              className={`flex flex-col bg-background  rounded-xl max-h-screen transition-all duration-300 ease-in-out overflow-hidden ${
                isDragging ? "transition-none" : ""
              } ${
                leftHidden
                  ? "opacity-0 invisible pointer-events-none w-0"
                  : "opacity-100 visible pointer-events-auto p-4 pr-2"
              }`}
              style={{
                width: leftHidden
                  ? "0%"
                  : rightHidden
                  ? "100%"
              : `${leftWidth}%`,
              }}
            >
              {renderPanel(activeLeftPanel.component, activeLeftPanel.params)}
            </div>
          )}

          {/* 只有当左右面板都存在且不隐藏时才显示分隔线 */}
          {activeLeftPanel &&
            activeRightPanel &&
            !leftHidden &&
            !rightHidden && (
            <div
              ref={dividerRef}
              className={`bg-sidebar rounded-4xl cursor-col-resize hover:bg-primary/10 transition-all duration-200 flex items-center justify-center ${
                isDragging ? "transition-none" : ""
              } opacity-100 visible pointer-events-auto w-2.5`}
              onMouseDown={handleMouseDown}
            >
              <div className="w-1 h-6 bg-muted/70 rounded-full" />
            </div>
          )}

          {/* 右侧面板 */}
          {activeRightPanel && (
            <div
              className={`bg-background rounded-xl flex-1 transition-all duration-300 ease-in-out overflow-hidden ${
                isDragging ? "transition-none" : ""
              } ${
                rightHidden
                  ? "opacity-0 invisible pointer-events-none w-0 "
                  : "opacity-100 visible pointer-events-auto  p-4"
              }`}
              style={{
                width: !hasLeftPanel || leftHidden ? "100%" : undefined,
              }}
            >
              {renderPanel(activeRightPanel.component, activeRightPanel.params)}
            </div>
          )}

          {/* 如果左右面板都隐藏，显示提示信息 */}
          {leftHidden && rightHidden && (
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
