/**
 * 面板渲染组件，负责处理基础面板和带快照的面板渲染逻辑
 */
import React from "react";
import { motion } from "motion/react";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { PanelConfig } from "@teatime-ai/api/types/tabs";

/**
 * 基础面板渲染属性接口
 */
interface RenderPanelProps {
  component: string; // 组件名称
  params: Record<string, any>; // 组件参数
  panelKey: string; // 面板唯一标识
}

/**
 * 渲染单个面板组件
 * @param panel 面板配置
 * @returns 渲染后的面板组件
 */
export const renderPanel = (panel: RenderPanelProps) => {
  const { component: componentName, params, panelKey } = panel;
  // 从组件映射中获取实际组件
  const Component = ComponentMap[componentName];
  
  // 如果组件不存在，显示错误信息
  if (!Component) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Component not found: {componentName}
      </div>
    );
  }
  
  // 渲染组件，添加淡入动画
  return (
    <motion.div
      key={panelKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="h-full w-full"
    >
      <Component panelKey={panelKey} {...params} />
    </motion.div>
  );
};

/**
 * 面板渲染器属性接口
 */
interface PanelRendererProps {
  basePanel: PanelConfig; // 基础面板配置
  onCloseDialog: (dialogId: string) => void; // 关闭对话框回调
}

/**
 * 面板渲染组件
 * 负责渲染基础面板和叠加的面板对话框
 */
export const PanelRenderer: React.FC<PanelRendererProps> = ({
  basePanel,
  onCloseDialog,
}) => {
  // 获取面板对话框列表
  const dialogs = basePanel.dialogs || [];

  // 是否有叠加的对话框
  const hasOverlay = dialogs.length > 0;

  return (
    <>
      {/* 渲染基础面板 */}
      <div
        className={cn(
          "h-full w-full transition-all duration-300",
          hasOverlay && "pointer-events-none select-none blur-sm opacity-80" // 如果有叠加层，基础面板不可交互并模糊
        )}
      >
        {renderPanel(basePanel)}
      </div>

      {/* 渲染叠加的对话框 */}
      {hasOverlay &&
        dialogs.map((dialog, index) => {
          // 计算对话框从顶部开始的深度
          const depthFromTop = dialogs.length - 1 - index;
          // 是否为最顶层对话框
          const isTop = depthFromTop === 0;
          // 对话框透明度，越底层透明度越低
          const opacity = 1 - depthFromTop * 0.12;
          
          // 统一内边距
          const inset = 16;
          // 顶部额外偏移
          const topInset = inset + 18;

          return (
            <motion.div
              key={dialog.id}
              className={cn(
                "absolute rounded-xl overflow-hidden border border-border shadow-2xl",
                isTop ? "pointer-events-auto" : "pointer-events-none" // 只有最顶层对话框可交互
              )}
              style={{
                zIndex: 10 + index, // 越顶层z-index越高
              }}
              initial={{
                opacity: 0,
                top: topInset + 10,
                left: inset,
                right: inset,
                bottom: inset,
              }}
              animate={{
                opacity,
                top: topInset,
                left: inset,
                right: inset,
                bottom: inset,
              }}
              transition={{ duration: 0.15 }} // 对话框显示动画
            >
              <div className="h-full w-full bg-background/95 backdrop-blur-sm rounded-xl p-2">
                <div className="flex h-full w-full flex-col">
                  {/* 对话框标题栏 */}
                  <div className="shrink-0 border-b bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      {/* 对话框标题 */}
                      <div className="min-w-0 text-sm font-medium">
                        <span className="truncate">
                          {getPanelTitle(dialog.component)}
                        </span>
                      </div>
                      {/* 对话框操作按钮 */}
                      <div className="flex items-center gap-1">
                        {/* 关闭按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onCloseDialog(dialog.id)}
                          aria-label="Close dialog"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* 对话框内容区域 */}
                  <div className="min-h-0 flex-1">
                    {renderPanel({
                      component: dialog.component,
                      params: dialog.params ?? {},
                      panelKey: dialog.id,
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
    </>
  );
};