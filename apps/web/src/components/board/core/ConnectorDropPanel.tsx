import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Delay before closing the secondary menu on hover leave. */
const SUBMENU_CLOSE_DELAY = 200;

type ConnectorDropItem = {
  /** Label shown in the panel. */
  label: string;
  /** Icon displayed alongside the label. */
  icon?: ReactNode;
  /** Node type to insert. */
  type: string;
  /** Node props for insertion. */
  props: Record<string, string>;
  /** Default size for the node. */
  size: [number, number];
};

type ConnectorDropGroup = {
  /** Group label shown in the panel. */
  label: string;
  /** Group icon displayed alongside the label. */
  icon?: ReactNode;
  /** Items rendered inside the group. */
  items: ConnectorDropItem[];
};

type ConnectorDropPanelProps = {
  /** Panel anchor position in screen space. */
  position: [number, number];
  /** Grouped items for connector drop insertion. */
  groups: ConnectorDropGroup[];
  /** Selection callback for the item. */
  onSelect: (item: ConnectorDropItem) => void;
};

/** Render the connector drop selection panel. */
const ConnectorDropPanel = forwardRef<HTMLDivElement, ConnectorDropPanelProps>(
  function ConnectorDropPanel({ position, groups, onSelect }, ref) {
    /** Open group index for the secondary menu. */
    const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);
    /** Active group resolved from the menu state. */
    const activeGroup = useMemo(
      () => (openGroupIndex === null ? null : groups[openGroupIndex] ?? null),
      [groups, openGroupIndex]
    );
    /** Close timer for hover-driven submenu. */
    const closeTimerRef = useRef<number | null>(null);

    useEffect(() => {
      if (openGroupIndex === null) return;
      if (openGroupIndex >= groups.length) {
        // 逻辑：分组变化时关闭二级面板，避免越界。
        setOpenGroupIndex(null);
      }
    }, [groups, openGroupIndex]);

    useEffect(() => {
      return () => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
      };
    }, []);

    const clearCloseTimer = () => {
      if (!closeTimerRef.current) return;
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    };

    const scheduleClose = () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
      // 逻辑：给鼠标从一级移动到二级留一点时间。
      closeTimerRef.current = window.setTimeout(() => {
        setOpenGroupIndex(null);
        closeTimerRef.current = null;
      }, SUBMENU_CLOSE_DELAY);
    };

    return (
      <div
        ref={ref}
        data-connector-drop-panel
        className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-3"
        style={{
          left: position[0],
          top: position[1],
        }}
      >
        <div className="relative pointer-events-auto">
          <div
            onPointerDown={event => {
              // 逻辑：阻止点击穿透触发画布选择。
              event.stopPropagation();
            }}
            className="min-w-[190px] rounded-2xl border border-slate-200/70 bg-background/95 px-3 py-2 text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur dark:border-slate-700/70 dark:text-slate-200"
          >
            <div className="mb-2 text-xs text-slate-500 dark:text-slate-300">
              选择要插入的组件
            </div>
            <div className="flex flex-col gap-1.5">
              {groups.map((group, index) => {
                const isOpen = openGroupIndex === index;
                return (
                  <button
                    key={group.label}
                    type="button"
                    onPointerEnter={() => {
                      clearCloseTimer();
                      setOpenGroupIndex(index);
                    }}
                    onPointerLeave={scheduleClose}
                    onFocus={() => setOpenGroupIndex(index)}
                    className={[
                      "flex items-center justify-between rounded-lg border px-2.5 py-2 text-[13px] transition",
                      "border-transparent text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
                      "dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                      isOpen
                        ? "border-slate-200/70 bg-slate-100/90 text-slate-900 dark:border-slate-600/70 dark:bg-slate-800/90 dark:text-slate-100"
                        : "",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-2">
                      {group.icon ? (
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {group.icon}
                        </span>
                      ) : null}
                      <span>{group.label}</span>
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {">"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {openGroupIndex !== null && activeGroup ? (
            <div
              onPointerDown={event => {
                // 逻辑：阻止点击穿透触发画布选择。
                event.stopPropagation();
              }}
              onPointerEnter={clearCloseTimer}
              onPointerLeave={scheduleClose}
              className="absolute left-full top-0 ml-3 min-w-[180px] rounded-2xl border border-slate-200/70 bg-background/95 px-3 py-2 text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.14)] backdrop-blur dark:border-slate-700/70 dark:text-slate-200"
            >
              <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                {activeGroup.label}
              </div>
              <div className="flex flex-col gap-1.5">
                {activeGroup.items.length ? (
                  activeGroup.items.map(item => (
                    <button
                      key={`${activeGroup.label}-${item.label}`}
                      type="button"
                      onClick={() => onSelect(item)}
                      className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-slate-100/70 px-2.5 py-2 text-[13px] text-slate-700 transition hover:bg-slate-100 dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        {item.icon ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {item.icon}
                          </span>
                        ) : null}
                        <span>{item.label}</span>
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        占位
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200/70 px-2.5 py-2 text-[12px] text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
                    暂无可用组件
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

ConnectorDropPanel.displayName = "ConnectorDropPanel";

export { ConnectorDropPanel };
export type { ConnectorDropGroup, ConnectorDropItem };
