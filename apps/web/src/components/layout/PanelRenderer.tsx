/**
 * 面板渲染组件，负责处理基础面板和带快照的面板渲染逻辑
 */
import React from "react";
import { motion } from "motion/react";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, EyeOff, X } from "lucide-react";
import { type SnapshotLayer } from "@/hooks/use_panel_snapshots";

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
 * 带快照的面板渲染属性接口
 */
interface PanelRendererProps {
  basePanel: { component: string; params: Record<string, any>; panelKey: string }; // 基础面板配置
  snapshotKey: string | null; // 快照唯一标识
  snapshotLayers?: SnapshotLayer[]; // 快照层列表
  snapshotHiddenAll?: boolean; // 是否隐藏所有快照
  onMoveUp: (key: string, layerId: string) => void; // 上移快照层回调
  onMoveDown: (key: string, layerId: string) => void; // 下移快照层回调
  onToggleHidden: (key: string, layerId: string) => void; // 切换快照层隐藏状态回调
  onClose: (key: string, layerId: string) => void; // 关闭快照层回调
  onSetHiddenAll: (key: string, hiddenAll: boolean) => void; // 设置所有快照层隐藏状态回调
  onSetAllSnapshotsHidden: (key: string, hidden: boolean) => void; // 设置所有快照隐藏状态回调
}

/**
 * 带快照的面板渲染组件
 * 负责渲染基础面板和叠加的快照层
 */
export const PanelRenderer: React.FC<PanelRendererProps> = ({
  basePanel,
  snapshotKey,
  snapshotLayers,
  snapshotHiddenAll = false,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  onClose,
  onSetHiddenAll,
  onSetAllSnapshotsHidden,
}) => {
  // 处理快照层列表，确保不为空
  const allLayers = !snapshotLayers || snapshotLayers.length === 0 ? [] : snapshotLayers;
  // 计算可见的快照层
  const visibleLayers = snapshotHiddenAll
    ? []
    : allLayers.filter((layer) => !layer.hidden);
  // 计算隐藏的快照层数量
  const hiddenCount = allLayers.length - visibleLayers.length;

  // 是否有叠加的快照层
  const hasOverlay = visibleLayers.length > 0;

  return (
    <>
      {/* 渲染基础面板 */}
      <div
        className={cn(
          "h-full w-full",
          hasOverlay && "pointer-events-none select-none" // 如果有叠加层，基础面板不可交互
        )}
      >
        {renderPanel(basePanel)}
      </div>

      {/* 显示快照按钮 - 当所有快照都被隐藏时 */}
      {snapshotHiddenAll && snapshotKey && allLayers.length > 0 && (
        <div className="absolute right-3 top-3 z-30 pointer-events-auto">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSetHiddenAll(snapshotKey, false)}
          >
            Show snapshots ({allLayers.length})
          </Button>
        </div>
      )}

      {/* 显示隐藏的快照按钮 - 当有部分快照被隐藏时 */}
      {!snapshotHiddenAll && snapshotKey && hiddenCount > 0 && (
        <div className="absolute right-3 top-3 z-30 pointer-events-auto">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSetAllSnapshotsHidden(snapshotKey, false)}
          >
            Show hidden ({hiddenCount})
          </Button>
        </div>
      )}

      {/* 渲染可见的快照层 */}
      {hasOverlay &&
        visibleLayers.map((layer, index) => {
          // 计算快照层从顶部开始的深度
          const depthFromTop = visibleLayers.length - 1 - index;
          // 是否为最顶层快照
          const isTop = depthFromTop === 0;
          // 快照层透明度，越底层透明度越低
          const opacity = 1 - depthFromTop * 0.12;
          // 基础内边距和叠加偏移量
          const baseInset = 16;
          const stackedOffset = depthFromTop * 10;
          // 最终内边距，越顶层内边距越小
          const inset = baseInset + stackedOffset;

          // 是否为第一个快照层（在数组中的位置）
          const isFirst = index === 0;
          // 是否为最后一个快照层（在数组中的位置）
          const isLast = index === visibleLayers.length - 1;

          return (
            <motion.div
              key={layer.id}
              className={cn(
                "absolute rounded-xl overflow-hidden ring-1 ring-border/40 shadow-lg",
                isTop ? "pointer-events-auto" : "pointer-events-none" // 只有最顶层快照可交互
              )}
              style={{
                zIndex: 10 + index, // 越顶层z-index越高
              }}
              initial={{
                opacity: 0,
                top: inset + 6,
                left: inset,
                right: inset,
                bottom: inset,
              }}
              animate={{
                opacity,
                top: inset,
                left: inset,
                right: inset,
                bottom: inset,
              }}
              transition={{ duration: 0.15 }} // 快照层显示动画
            >
              <div className="h-full w-full bg-background/85 backdrop-blur-sm rounded-xl p-2">
                <div className="flex h-full w-full flex-col">
                  {/* 快照层标题栏 */}
                  <div className="shrink-0 border-b bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      {/* 快照标题 */}
                      <div className="min-w-0 text-sm font-medium">
                        <span className="truncate">
                          {getPanelTitle(layer.component)}
                        </span>
                      </div>
                      {/* 快照操作按钮 */}
                      <div className="flex items-center gap-1">
                        {/* 上移按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!snapshotKey || isLast}
                          onClick={() => {
                            if (!snapshotKey) return;
                            onMoveUp(snapshotKey, layer.id);
                          }}
                          aria-label="Move snapshot up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        {/* 下移按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!snapshotKey || isFirst}
                          onClick={() => {
                            if (!snapshotKey) return;
                            onMoveDown(snapshotKey, layer.id);
                          }}
                          aria-label="Move snapshot down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        {/* 隐藏按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!snapshotKey}
                          onClick={() => {
                            if (!snapshotKey) return;
                            onToggleHidden(snapshotKey, layer.id);
                          }}
                          aria-label="Hide snapshot"
                        >
                          <EyeOff className="h-4 w-4" />
                        </Button>
                        {/* 关闭按钮 */}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!snapshotKey}
                          onClick={() => {
                            if (!snapshotKey) return;
                            onClose(snapshotKey, layer.id);
                          }}
                          aria-label="Close snapshot"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  {/* 快照内容区域 */}
                  <div className="min-h-0 flex-1">
                    {renderPanel({
                      component: layer.component,
                      params: layer.params ?? {},
                      panelKey: layer.id,
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
