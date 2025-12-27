import { forwardRef } from "react";
import { DEFAULT_NODE_SIZE } from "../engine/constants";

type ConnectorDropItem = {
  /** Label shown in the panel. */
  label: string;
  /** Node type to insert. */
  type: string;
  /** Node props for insertion. */
  props: Record<string, string>;
  /** Default size for the node. */
  size: [number, number];
};

type ConnectorDropPanelProps = {
  /** Panel anchor position in screen space. */
  position: [number, number];
  /** Selection callback for the item. */
  onSelect: (item: ConnectorDropItem) => void;
};

/** Available placeholder items for connector drop creation. */
const connectorDropItems: ConnectorDropItem[] = [
  {
    label: "图片", // 显示的按钮标签。
    type: "placeholder", // 创建的节点类型。
    props: { title: "Image", description: "Image placeholder card." }, // 初始属性。
    size: DEFAULT_NODE_SIZE, // 默认尺寸。
  },
  {
    label: "便签", // 显示的按钮标签。
    type: "placeholder", // 创建的节点类型。
    props: { title: "Note", description: "Quick note placeholder card." }, // 初始属性。
    size: DEFAULT_NODE_SIZE, // 默认尺寸。
  },
  {
    label: "文字", // 显示的按钮标签。
    type: "placeholder", // 创建的节点类型。
    props: { title: "Text", description: "Simple text placeholder node." }, // 初始属性。
    size: DEFAULT_NODE_SIZE, // 默认尺寸。
  },
];

/** Render the connector drop selection panel. */
const ConnectorDropPanel = forwardRef<HTMLDivElement, ConnectorDropPanelProps>(
  function ConnectorDropPanel({ position, onSelect }, ref) {
    return (
      <div
        ref={ref}
        data-connector-drop-panel
        onPointerDown={event => {
          // 逻辑：阻止点击穿透触发画布选择。
          event.stopPropagation();
        }}
        className="pointer-events-auto absolute z-30 min-w-[180px] -translate-x-1/2 -translate-y-3 rounded-xl border border-slate-700/40 bg-slate-900/90 px-3 py-2 text-slate-50 shadow-[0_18px_36px_rgba(15,23,42,0.35)] backdrop-blur"
        style={{
          left: position[0],
          top: position[1],
        }}
      >
        <div className="mb-2 text-xs text-slate-200/70">选择要插入的组件</div>
        <div className="flex flex-col gap-1.5">
          {connectorDropItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelect(item)}
              className="flex items-center justify-between rounded-lg border border-slate-400/30 bg-slate-400/20 px-2.5 py-2 text-[13px] text-slate-50 transition hover:bg-slate-400/30"
            >
              {item.label}
              <span className="text-[11px] text-slate-200/70">占位</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

ConnectorDropPanel.displayName = "ConnectorDropPanel";

export { ConnectorDropPanel };
export type { ConnectorDropItem };
