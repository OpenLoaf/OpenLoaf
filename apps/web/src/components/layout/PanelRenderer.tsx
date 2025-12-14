import React from "react";
import { motion } from "motion/react";
import { ComponentMap, getPanelTitle } from "@/utils/panel-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, EyeOff, X } from "lucide-react";
import { type SnapshotLayer } from "@/hooks/use_panel_snapshots";

interface RenderPanelProps {
  component: string;
  params: Record<string, any>;
  panelKey: string;
}

export const renderPanel = (panel: RenderPanelProps) => {
  const { component: componentName, params, panelKey } = panel;
  const Component = ComponentMap[componentName];
  if (!Component) {
    return (
      <div className="h-full flex items-center justify-center text-muted">
        Component not found: {componentName}
      </div>
    );
  }
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

interface PanelRendererProps {
  basePanel: { component: string; params: Record<string, any>; panelKey: string };
  snapshotKey: string | null;
  snapshotLayers?: SnapshotLayer[];
  snapshotHiddenAll?: boolean;
  onMoveUp: (key: string, layerId: string) => void;
  onMoveDown: (key: string, layerId: string) => void;
  onToggleHidden: (key: string, layerId: string) => void;
  onClose: (key: string, layerId: string) => void;
  onSetHiddenAll: (key: string, hiddenAll: boolean) => void;
  onSetAllSnapshotsHidden: (key: string, hidden: boolean) => void;
}

export const PanelRenderer: React.FC<PanelRendererProps> = ({
  basePanel,
  snapshotKey,
  snapshotLayers,
  snapshotHiddenAll,
  onMoveUp,
  onMoveDown,
  onToggleHidden,
  onClose,
  onSetHiddenAll,
  onSetAllSnapshotsHidden,
}) => {
  const allLayers = !snapshotLayers || snapshotLayers.length === 0 ? [] : snapshotLayers;
  const visibleLayers = snapshotHiddenAll
    ? []
    : allLayers.filter((layer) => !layer.hidden);
  const hiddenCount = allLayers.length - visibleLayers.length;

  const hasOverlay = visibleLayers.length > 0;

  return (
    <>
      <div
        className={cn(
          "h-full w-full",
          hasOverlay && "pointer-events-none select-none"
        )}
      >
        {renderPanel(basePanel)}
      </div>

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

      {hasOverlay &&
        visibleLayers.map((layer, index) => {
          const depthFromTop = visibleLayers.length - 1 - index;
          const isTop = depthFromTop === 0;
          const opacity = 1 - depthFromTop * 0.12;
          const baseInset = 16;
          const stackedOffset = depthFromTop * 10;
          const inset = baseInset + stackedOffset;

          const isFirst = index === 0;
          const isLast = index === visibleLayers.length - 1;

          return (
            <motion.div
              key={layer.id}
              className={cn(
                "absolute rounded-xl overflow-hidden ring-1 ring-border/40 shadow-lg",
                isTop ? "pointer-events-auto" : "pointer-events-none"
              )}
              style={{
                zIndex: 10 + index,
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
              transition={{ duration: 0.15 }}
            >
              <div className="h-full w-full bg-background/85 backdrop-blur-sm rounded-xl p-2">
                <div className="flex h-full w-full flex-col">
                  <div className="shrink-0 border-b bg-background/70 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 text-sm font-medium">
                        <span className="truncate">
                          {getPanelTitle(layer.component)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
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
