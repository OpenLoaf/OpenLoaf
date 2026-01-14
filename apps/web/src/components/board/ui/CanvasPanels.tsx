"use client";

import type { ReactNode } from "react";
import { cn } from "@udecode/cn";
import {
  ArrowRight,
  ChartSpline,
  CornerRightDown,
  PencilLine,
  Sparkles,
  Trash2,
} from "lucide-react";

import type {
  CanvasConnectorElement,
  CanvasConnectorStyle,
  CanvasNodeElement,
  CanvasPoint,
  CanvasSnapshot,
} from "../engine/types";
import { toScreenPoint } from "../utils/coordinates";
import { useBoardEngine } from "../core/BoardProvider";
import { useBoardViewState } from "../core/useBoardViewState";

type ConnectorActionPanelProps = {
  /** Snapshot used for positioning. */
  snapshot: CanvasSnapshot;
  /** Selected connector element. */
  connector: CanvasConnectorElement;
  /** Apply a new connector style. */
  onStyleChange: (style: CanvasConnectorStyle) => void;
  /** Delete the selected connector. */
  onDelete: () => void;
};

/** Render a style panel when a connector is selected. */
function ConnectorActionPanel({
  snapshot,
  connector,
  onStyleChange,
  onDelete,
}: ConnectorActionPanelProps) {
  const [x, y, w, h] = connector.xywh;
  const center: CanvasPoint = [x + w / 2, y + h / 2];
  // 逻辑：面板位置随视口变化实时更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const screen = toScreenPoint(center, viewState);
  const currentStyle = connector.style ?? snapshot.connectorStyle;

  return (
    <div
      data-connector-action
      className="pointer-events-auto absolute z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-slate-200/40 bg-background/90 px-2 py-1 shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur"
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={event => {
        // 逻辑：避免面板交互触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="flex items-center gap-3">
        <ConnectorStyleButton
          title="直线"
          active={currentStyle === "straight"}
          onPointerDown={() => onStyleChange("straight")}
        >
          <ArrowRight size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="折线"
          active={currentStyle === "elbow"}
          onPointerDown={() => onStyleChange("elbow")}
        >
          <CornerRightDown size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="曲线"
          active={currentStyle === "curve"}
          onPointerDown={() => onStyleChange("curve")}
        >
          <ChartSpline size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="手绘"
          active={currentStyle === "hand"}
          onPointerDown={() => onStyleChange("hand")}
        >
          <PencilLine size={14} />
        </ConnectorStyleButton>
        <ConnectorStyleButton
          title="飞行"
          active={currentStyle === "fly"}
          onPointerDown={() => onStyleChange("fly")}
        >
          <Sparkles size={14} />
        </ConnectorStyleButton>
      </div>
      <span className="mx-1 h-4 w-px bg-border" />
      <button
        type="button"
        onPointerDown={event => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition hover:bg-destructive/10 hover:text-destructive"
        title="删除连线"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

type ConnectorStyleButtonProps = {
  /** Button label for tooltip. */
  title: string;
  /** Whether the button is active. */
  active: boolean;
  /** Pointer down handler. */
  onPointerDown: () => void;
  /** Icon content. */
  children: ReactNode;
};

/** Render a connector style control button. */
function ConnectorStyleButton({
  title,
  active,
  onPointerDown,
  children,
}: ConnectorStyleButtonProps) {
  return (
    <button
      type="button"
      onPointerDown={event => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition",
        active
          ? "bg-slate-900 text-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)]"
          : "hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800/70 dark:hover:text-slate-100"
      )}
      title={title}
    >
      {children}
    </button>
  );
}

type NodeInspectorPanelProps = {
  /** Target node element. */
  element: CanvasNodeElement;
  /** Close handler. */
  onClose: () => void;
};

/** Render a compact inspector panel for a node. */
function NodeInspectorPanel({ element, onClose }: NodeInspectorPanelProps) {
  const [x, y, w, h] = element.xywh;
  // 逻辑：使用独立视图订阅计算面板位置，避免依赖全量快照更新。
  const engine = useBoardEngine();
  const viewState = useBoardViewState(engine);
  const { zoom, offset, size } = viewState.viewport;
  const nodeTop = y * zoom + offset[1];
  const showBelow = nodeTop <= size[1] * 0.15;
  const anchor: CanvasPoint = showBelow ? [x + w / 2, y + h] : [x + w / 2, y];
  const screen = toScreenPoint(anchor, viewState);

  const details = extractNodeDetails(element);

  return (
    <div
      data-node-inspector
      className={cn(
        "pointer-events-auto absolute z-30 min-w-[220px] -translate-x-1/2 rounded-xl",
        "border border-slate-200/70 bg-background/95 px-3 py-2 text-xs text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur",
        "dark:border-slate-700/70 dark:text-slate-200",
        showBelow ? "mt-3" : "mb-3"
      )}
      style={{ left: screen[0], top: screen[1] }}
      onPointerDown={event => {
        // 逻辑：面板交互不触发画布选择。
        event.stopPropagation();
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
          节点详情
        </span>
        <button
          type="button"
          onPointerDown={event => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          className="rounded-full px-1 py-0.5 text-[11px] text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-100"
        >
          关闭
        </button>
      </div>
      <div className="space-y-1">
        {details.map(detail => (
          <div key={detail.label} className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {detail.label}
            </span>
            <span className="text-[11px] font-medium text-slate-800 dark:text-slate-100">
              {detail.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type NodeDetailItem = {
  /** Detail label. */
  label: string;
  /** Detail value. */
  value: string;
};

/** Extract basic details from the node for the inspector. */
function extractNodeDetails(element: CanvasNodeElement): NodeDetailItem[] {
  const [x, y, w, h] = element.xywh;
  const details: NodeDetailItem[] = [
    { label: "类型", value: element.type },
    { label: "ID", value: element.id },
    { label: "位置", value: `${Math.round(x)}, ${Math.round(y)}` },
    { label: "尺寸", value: `${Math.round(w)} × ${Math.round(h)}` },
  ];

  if (element.props && typeof element.props === "object") {
    const props = element.props as Record<string, unknown>;
    if (typeof props.title === "string") {
      details.push({ label: "标题", value: props.title });
    }
    if (typeof props.description === "string") {
      details.push({ label: "描述", value: props.description });
    }
  }

  return details;
}

export { ConnectorActionPanel, NodeInspectorPanel };
