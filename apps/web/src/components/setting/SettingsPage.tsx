"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { trpc } from "@/utils/trpc";
import {
  Bot,
  KeyRound,
  Boxes,
  SlidersHorizontal,
  User,
  Info,
  Keyboard,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { BasicSettings } from "./menus/BasicSettings";
import { AccountSettings } from "./menus/AccountSettings";
import { AboutTeatime } from "./menus/AboutTeatime";
import { KeyManagement } from "./menus/KeyManagement";
import { ModelManagement } from "./menus/ModelManagement";
import { AgentManagement } from "./menus/agent/AgentManagement";
import { KeyboardShortcuts } from "./menus/KeyboardShortcuts";
import { WorkspaceSettings } from "./menus/Workspace";
import { CommandAllowlist } from "./menus/CommandAllowlist";

type SettingsMenuKey =
  | "basic"
  | "account"
  | "about"
  | "models"
  | "keys"
  | "agents"
  | "workspace"
  | "shortcuts"
  | "whitelist";

const MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> = [
  { key: "basic", label: "基础", Icon: SlidersHorizontal, Component: BasicSettings },
  { key: "account", label: "账户", Icon: User, Component: AccountSettings },
  { key: "workspace", label: "工作空间", Icon: Building2, Component: WorkspaceSettings },
  { key: "models", label: "模型", Icon: Boxes, Component: ModelManagement },
  { key: "keys", label: "密钥", Icon: KeyRound, Component: KeyManagement },
  { key: "whitelist", label: "白名单", Icon: ShieldCheck, Component: CommandAllowlist },
  { key: "agents", label: "Agent", Icon: Bot, Component: AgentManagement },
  { key: "shortcuts", label: "快捷键", Icon: Keyboard, Component: KeyboardShortcuts },
  { key: "about", label: "关于Teatime", Icon: Info, Component: AboutTeatime },
];

export default function SettingsPage({
  panelKey: _panelKey,
  tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>("basic");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [menuAnimationEnabled, setMenuAnimationEnabled] = useState(true);
  const [openTooltipKey, setOpenTooltipKey] = useState<SettingsMenuKey | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const playedMenuAnimationRef = useRef(false);
  const disableMenuAnimationTimeoutRef = useRef<number | null>(null);
  const prevActiveKeyRef = useRef<SettingsMenuKey>(activeKey);

  const setTabMinLeftWidth = useTabs((s) => s.setTabMinLeftWidth);
  const activeTabId = useTabs((s) => s.activeTabId);
  const isActiveTab = activeTabId === tabId;

  /**
   * 把 runtime 连接状态轮询放在 SettingsPage（父组件）里：
   * - 避免只在“关于Teatime”页面打开时才轮询
   * - 用户切换设置菜单时仍可持续刷新状态（同一个 query key，子页面直接读缓存即可）
   */
  const appId = typeof window !== "undefined" ? window.teatimeElectron?.appId : undefined;
  useQuery({
    ...trpc.runtime.getAppStatus.queryOptions({ appId: appId ?? "" }),
    // 仅在“关于Teatime”菜单激活时轮询，避免设置页其他菜单也持续刷接口。
    enabled: Boolean(appId) && isActiveTab && activeKey === "about",
    refetchInterval: 2000,
    staleTime: 1000,
    meta: { silent: true },
  });

  useEffect(() => {
    setTabMinLeftWidth(tabId, 500);
    return () => setTabMinLeftWidth(tabId, undefined);
  }, [tabId, setTabMinLeftWidth]);

  useEffect(() => {
    if (isActiveTab) return;
    setOpenTooltipKey(null);
  }, [isActiveTab]);

  useEffect(() => {
    const prevKey = prevActiveKeyRef.current;
    prevActiveKeyRef.current = activeKey;
    if (prevKey === activeKey) return;

    if (!menuAnimationEnabled) return;
    if (playedMenuAnimationRef.current) return;

    // Only disable the menu transition after it has played once (i.e. after the first menu switch).
    playedMenuAnimationRef.current = true;
    disableMenuAnimationTimeoutRef.current = window.setTimeout(() => {
      setMenuAnimationEnabled(false);
      disableMenuAnimationTimeoutRef.current = null;
    }, 220);
  }, [activeKey, menuAnimationEnabled]);

  useEffect(() => {
    return () => {
      if (disableMenuAnimationTimeoutRef.current) {
        window.clearTimeout(disableMenuAnimationTimeoutRef.current);
        disableMenuAnimationTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCollapsed(entry.contentRect.width < 700);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const ActiveComponent = useMemo(
    () => MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey],
  );

  const menuGroups = useMemo(() => {
    const byKey = new Map(MENU.map((item) => [item.key, item]));
    return [
      [byKey.get("basic"), byKey.get("account"), byKey.get("workspace")].filter(Boolean),
      [byKey.get("models"), byKey.get("keys"), byKey.get("whitelist"), byKey.get("agents")].filter(Boolean),
      [byKey.get("shortcuts"), byKey.get("about")].filter(Boolean),
    ] as Array<typeof MENU>;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-background"
    >
      <div className="flex h-full min-h-0">
        <motion.div
          animate={{ width: isCollapsed ? 60 : 192 }}
          initial={false}
          className="shrink-0 border-r border-border bg-muted/20"
        >
          <ScrollArea className="h-full">
            <div className="p-3 pl-1 space-y-2">
              {menuGroups.map((group, groupIndex) => (
                <div key={`group_${groupIndex}`} className="space-y-2">
                  {group.map((item) => {
                    const active = item.key === activeKey;
                    const Icon = item.Icon;
                    const tooltipEnabled = isCollapsed && isActiveTab;
                    const button = (
                      <Button
                        variant={active ? "secondary" : "ghost"}
                        size="sm"
                        className={cn(
                          "w-full h-9",
                          isCollapsed ? "justify-center px-0" : "justify-start",
                          active && "text-foreground",
                        )}
                        onClick={() => setActiveKey(item.key)}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            !isCollapsed && "mr-2",
                          )}
                        />
                        {!isCollapsed && item.label}
                      </Button>
                    );

                    if (!tooltipEnabled) return <div key={item.key}>{button}</div>;

                    return (
                      <Tooltip
                        key={item.key}
                        delayDuration={0}
                        open={openTooltipKey === item.key}
                        onOpenChange={(open) => {
                          if (open) {
                            setOpenTooltipKey(item.key);
                            return;
                          }
                          setOpenTooltipKey((prev) =>
                            prev === item.key ? null : prev,
                          );
                        }}
                      >
                        <TooltipTrigger asChild>
                          {button}
                        </TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </motion.div>

        <div className="min-w-[400px] flex-1">
          <ScrollArea className="h-full">
            <div className="p-3 pr-1">
              {menuAnimationEnabled ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={activeKey}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    <ActiveComponent />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div key={activeKey}>
                  <ActiveComponent />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
