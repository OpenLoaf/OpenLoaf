import { forwardRef, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Delay before closing the secondary menu on hover leave. */
const SUBMENU_CLOSE_DELAY = 2000;
/** Fade duration for submenu visibility transitions. */
const SUBMENU_FADE_DURATION = 200;

type ConnectorDropItem = {
  /** Label shown in the panel. */
  label: string;
  /** Subtitle shown on hover. */
  subtitle?: string;
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
  items?: ConnectorDropItem[];
  /** Direct item used when no submenu is needed. */
  item?: ConnectorDropItem;
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
    const [visibleGroupIndex, setVisibleGroupIndex] = useState<number | null>(null);
    /** Track submenu visibility for fade animation. */
    const [isSubmenuVisible, setIsSubmenuVisible] = useState(false);
    /** Active group resolved from the menu state. */
    const activeGroup = useMemo(() => {
      if (visibleGroupIndex === null) return null;
      const group = groups[visibleGroupIndex];
      if (!group?.items?.length) return null;
      return group;
    }, [groups, visibleGroupIndex]);
    /** Close timer for hover-driven submenu. */
    const closeTimerRef = useRef<number | null>(null);
    /** Unmount timer for submenu fade-out. */
    const unmountTimerRef = useRef<number | null>(null);

    useEffect(() => {
      if (openGroupIndex === null) {
        if (visibleGroupIndex === null) return;
        setIsSubmenuVisible(false);
        if (unmountTimerRef.current) {
          window.clearTimeout(unmountTimerRef.current);
        }
        // 逻辑：延迟卸载二级面板，保留淡出动画。
        unmountTimerRef.current = window.setTimeout(() => {
          setVisibleGroupIndex(null);
          unmountTimerRef.current = null;
        }, SUBMENU_FADE_DURATION);
        return;
      }
      const group = groups[openGroupIndex];
      if (!group?.items?.length) {
        // 逻辑：分组变化时关闭二级面板，避免越界。
        setOpenGroupIndex(null);
        return;
      }
      if (unmountTimerRef.current) {
        window.clearTimeout(unmountTimerRef.current);
        unmountTimerRef.current = null;
      }
      setVisibleGroupIndex(openGroupIndex);
      setIsSubmenuVisible(true);
    }, [groups, openGroupIndex, visibleGroupIndex]);

    useEffect(() => {
      return () => {
        if (closeTimerRef.current) {
          window.clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        if (unmountTimerRef.current) {
          window.clearTimeout(unmountTimerRef.current);
          unmountTimerRef.current = null;
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
            className="min-w-[176px] rounded-2xl border border-slate-200/80 bg-background/95 px-2.5 py-1.5 text-slate-700 shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/80 backdrop-blur dark:border-slate-700/80 dark:text-slate-200 dark:ring-slate-700/60"
          >
            <div className="mb-1.5 text-[11px] text-slate-500 dark:text-slate-300">
              选择要插入的组件
            </div>
            <div className="flex flex-col gap-1">
              {groups.map((group, index) => {
                const isOpen = openGroupIndex === index;
                const hasSubmenu = Boolean(group.items?.length);
                const directItem = !hasSubmenu ? group.item : undefined;
                const hoverClassName = hasSubmenu
                  ? ""
                  : "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100";
                return (
                  <button
                    key={group.label}
                    type="button"
                    onClick={directItem ? () => onSelect(directItem) : undefined}
                    onPointerEnter={() => {
                      clearCloseTimer();
                      if (hasSubmenu) {
                        setOpenGroupIndex(index);
                      } else {
                        setOpenGroupIndex(null);
                      }
                    }}
                    onPointerLeave={scheduleClose}
                    onFocus={() => {
                      if (hasSubmenu) {
                        setOpenGroupIndex(index);
                      } else {
                        setOpenGroupIndex(null);
                      }
                    }}
                    className={[
                      "flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[12px] transition",
                      "border-transparent text-slate-600",
                      "dark:text-slate-300",
                      hoverClassName,
                      isOpen
                        ? "border-slate-200/80 bg-slate-100 text-slate-900 shadow-sm dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-100"
                        : "",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-2">
                      {group.icon ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          {group.icon}
                        </span>
                      ) : null}
                      <span>{group.label}</span>
                    </span>
                    {hasSubmenu ? (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {">"}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
          {activeGroup ? (
            <div
              onPointerDown={event => {
                // 逻辑：阻止点击穿透触发画布选择。
                event.stopPropagation();
              }}
              onPointerEnter={clearCloseTimer}
              onPointerLeave={scheduleClose}
              className={[
                "absolute left-full top-0 ml-3 min-w-[168px] rounded-2xl border border-slate-200/80 bg-background/95 px-2.5 py-1.5 text-slate-700 shadow-[0_24px_56px_rgba(15,23,42,0.24)] ring-1 ring-slate-200/80 backdrop-blur transition-opacity duration-200 ease-out dark:border-slate-700/80 dark:text-slate-200 dark:ring-slate-700/60",
                isSubmenuVisible ? "opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
            >
              <div className="mb-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                {activeGroup.label}
              </div>
              <div className="flex flex-col gap-1">
                {activeGroup.items?.length ? (
                  activeGroup.items.map(item => (
                    <button
                      key={`${activeGroup.label}-${item.label}`}
                      type="button"
                      onClick={() => onSelect(item)}
                      className="group flex items-start rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-700 transition hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <span className="flex min-w-0 flex-col items-start">
                        <span className="flex items-center gap-2">
                          {item.icon ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-slate-100 text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.5)] dark:bg-slate-800 dark:text-slate-300 dark:shadow-[inset_0_0_0_1px_rgba(71,85,105,0.8)]">
                              {item.icon}
                            </span>
                          ) : null}
                          <span className="leading-4">{item.label}</span>
                        </span>
                        {item.subtitle ? (
                          <span className="mt-0 max-h-0 overflow-hidden text-[10px] text-slate-400 opacity-0 transition-[max-height,opacity,margin] duration-200 ease-out group-hover:mt-0.5 group-hover:max-h-5 group-hover:opacity-100 group-focus-visible:mt-0.5 group-focus-visible:max-h-5 group-focus-visible:opacity-100 dark:text-slate-500">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200/70 px-2.5 py-1.5 text-[11px] text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
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
