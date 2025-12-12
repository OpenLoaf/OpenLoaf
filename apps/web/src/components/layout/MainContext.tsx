import React, { useState, useRef, useEffect } from "react";
import { useTabs } from "@/hooks/use_tabs";
import PlantPage from "@/components/plant/Plant";
import { Chat } from "../chat/Chat";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export const MainContent: React.FC<{ className?: string }> = ({
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const {
    activeLeftPanel: leftPanel,
    activeRightPanel: rightPanel,
    activeLeftWidth,
    updateCurrentTabLeftWidth,
  } = useTabs();

  const hasLeftPanel = Boolean(leftPanel);
  const hasRightPanel = Boolean(rightPanel);
  const leftHidden = leftPanel?.hidden ?? false;
  const rightHidden = rightPanel?.hidden ?? false;
  const computedLeftHidden = leftHidden || !hasLeftPanel;

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
    const clampedWidth = Math.max(30, Math.min(70, newWidth));
    updateCurrentTabLeftWidth(clampedWidth);
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
      {/* Sheet 组件 */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        {/* Sheet 触发按钮 */}
        <SheetTrigger className="fixed bottom-4 right-4 bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:bg-primary/90 transition-all duration-200 z-50">
          Open Sheet
        </SheetTrigger>

        {/* Sheet 内容 */}
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Side Sheet</SheetTitle>
            <SheetDescription>
              This is a side sheet that can be used for additional content.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              Sheet content goes here. You can add any components or information
              you need.
            </p>
          </div>
          <SheetFooter>
            <SheetClose className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-all duration-200">
              Close
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {hasLeftPanel || hasRightPanel ? (
        <>
          {/* 左侧面板 */}
          {(hasLeftPanel || hasRightPanel) && (
            <div
              className={`flex flex-col bg-background rounded-xl max-h-screen transition-all duration-300 ease-in-out overflow-hidden transform ${
                isDragging ? "transition-none" : ""
              } ${
                computedLeftHidden
                  ? "opacity-0 -translate-x-full pointer-events-none"
                  : "opacity-100 translate-x-0 pointer-events-auto p-4 pr-2"
              } ${!hasLeftPanel ? "p-0" : ""}`}
              style={{
                width: computedLeftHidden
                  ? "0%"
                  : rightHidden
                  ? "100%"
                  : `${activeLeftWidth}%`,
              }}
            >
              {leftPanel && renderPanel(leftPanel.component, leftPanel.params)}
            </div>
          )}

          {/* 只有当左右面板都存在且不隐藏时才显示分隔线 */}
          {leftPanel && rightPanel && !leftHidden && !rightHidden && (
            <div
              ref={dividerRef}
              className={`bg-sidebar rounded-4xl cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-all duration-200 flex items-center justify-center ${
                isDragging ? "transition-none bg-primary/10 scale-x-125" : ""
              } opacity-100 visible pointer-events-auto w-2.5`}
              onMouseDown={handleMouseDown}
            >
              <div
                className={`w-1 h-6 bg-muted/70 rounded-full transition-all duration-200 ${
                  isDragging ? "bg-primary/70 scale-y-125" : ""
                }`}
              />
            </div>
          )}

          {/* 右侧面板 */}
          {rightPanel && (
            <div
              className={`bg-background rounded-xl flex-1 transition-all duration-300 ease-in-out overflow-hidden transform ${
                isDragging ? "transition-none" : ""
              } ${
                rightHidden
                  ? "opacity-0 translate-x-full pointer-events-none"
                  : "opacity-100 translate-x-0 pointer-events-auto p-4"
              }`}
              style={{
                width: !hasLeftPanel || leftHidden ? "100%" : undefined,
              }}
            >
              {renderPanel(rightPanel.component, rightPanel.params)}
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
