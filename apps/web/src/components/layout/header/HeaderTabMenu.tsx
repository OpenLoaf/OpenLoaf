import { Bot, CircleX, Globe, Pin, PinOff, X } from "lucide-react";
import { TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import { useTabs } from "@/hooks/use-tabs";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import type { Tab } from "@tenas-ai/api/common";
import type { CSSProperties } from "react";

interface TabMenuProps {
  tab: Tab;
  activeTabId: string | null;
  activeTabRef: React.RefObject<HTMLButtonElement | null>;
  closeTab: (tabId: string) => void;
  workspaceTabs: Tab[];
  onReorderPointerDown?: (
    event: React.PointerEvent<HTMLButtonElement>,
    tabId: string
  ) => void;
  isDragging?: boolean;
  isPinned?: boolean;
  onTogglePin?: (tabId: string, pin: boolean) => void;
}

export const TabMenu = ({
  tab,
  activeTabId,
  activeTabRef,
  closeTab,
  workspaceTabs,
  onReorderPointerDown,
  isDragging = false,
  isPinned = false,
  onTogglePin,
}: TabMenuProps) => {
  const isActive = tab.id === activeTabId;
  const hasBrowserWindow = Array.isArray(tab.stack) && tab.stack.some((s) => s.component === "electron-browser-window");
  const chatStatus = useTabs((s) => s.chatStatusByTabId[tab.id]);
  const isDictating = useTabs((s) => Boolean(s.dictationStatusByTabId[tab.id]));
  // 中文注释：与 ChatInput 一致，submitted/streaming 都算 SSE 正在加载。
  const showThinkingBorder =
    chatStatus === "submitted" || chatStatus === "streaming" || isDictating;
  const thinkingBorderStyle = showThinkingBorder
    ? ({
        // Tab 上的彩虹边框只需要“外框”，内部填充保持与当前区域一致，避免未激活 Tab 看起来像“被选中”。
        ["--tenas-thinking-border-fill" as any]: isActive
          ? "var(--color-background)"
          : "var(--color-sidebar)",
      } as CSSProperties)
    : undefined;
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(
          new CustomEvent("tenas:overlay", {
            detail: { id: `tabmenu:${tab.id}`, open },
          })
        );
      }}
    >
      <ContextMenuTrigger
        asChild
        className="relative inline-flex items-center group"
      >
        <TabsTrigger
          ref={tab.id === activeTabId ? activeTabRef : null}
          value={tab.id}
          data-no-drag="true"
          data-tab-id={tab.id}
          data-pinned={isPinned ? "true" : "false"}
          data-reordering={isDragging ? "true" : "false"}
          onPointerDown={(event) => onReorderPointerDown?.(event, tab.id)}
          style={thinkingBorderStyle}
          className={cn(
            "h-7 pl-2 pr-7 text-xs gap-0 rounded-md text-muted-foreground bg-transparent aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-none relative z-10 flex items-center max-w-[180px] flex-none w-auto shrink-0 cursor-default active:cursor-grabbing data-[reordering=true]:cursor-grabbing border border-transparent",
            // tenas-thinking-border 默认会设置 padding-box 的填充色（fallback 为 background）。
            // 如果把它常驻在所有 Tab 上，会导致“未激活 Tab 也像被选中”（背景被覆盖）。
            // 因此这里仅在流式生成中才挂载该类名。
            showThinkingBorder && "tenas-thinking-border tenas-thinking-border-on"
          )}
        >
          {tab.icon === "bot" ? (
            <Bot className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
          ) : (
            tab.icon && <span className="mr-1.5 shrink-0">{tab.icon}</span>
          )}
          <span className="min-w-0 flex-1 truncate">{tab.title || "Untitled"}</span>
          {hasBrowserWindow ? (
            <Globe className="ml-1 size-3 shrink-0 text-muted-foreground/80" />
          ) : null}
          {!isPinned && (
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 transition-opacity delay-0 group-hover:delay-300 ${
                workspaceTabs.length <= 1
                  ? "opacity-0"
                  : "opacity-0 group-hover:opacity-100"
              } ${
                isActive
                  ? "group-hover:bg-background hover:bg-background"
                  : "group-hover:bg-sidebar hover:bg-sidebar"
              } z-20 p-0 cursor-pointer flex items-center justify-center rounded-full`}
              onClick={(e) => {
                e.stopPropagation();
                if (workspaceTabs.length > 1) {
                  closeTab(tab.id);
                }
              }}
              aria-label="Close tab"
              role="button"
              style={{
                pointerEvents: workspaceTabs.length <= 1 ? "none" : "auto",
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </TabsTrigger>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          icon={isPinned ? PinOff : Pin}
          onClick={() => onTogglePin?.(tab.id, !isPinned)}
        >
          {isPinned ? "取消置顶" : "置顶"}
        </ContextMenuItem>
        <ContextMenuItem
          icon={X}
          onClick={() => {
            if (workspaceTabs.length > 1 && !isPinned) {
              closeTab(tab.id);
            }
          }}
          disabled={workspaceTabs.length <= 1 || isPinned}
        >
          关闭
          <ContextMenuShortcut>⌘W</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          icon={CircleX}
          onClick={() => {
            const tabsToClose = workspaceTabs.filter(
              (t) => t.id !== tab.id && !t.isPin
            );
            tabsToClose.forEach((t) => closeTab(t.id));
          }}
          disabled={workspaceTabs.filter((t) => !t.isPin).length <= 1}
        >
          关闭其他
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
