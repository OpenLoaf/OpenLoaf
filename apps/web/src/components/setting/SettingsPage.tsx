"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import {
  Bot,
  KeyRound,
  Boxes,
  SlidersHorizontal,
  Info,
  Keyboard,
  Building2,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";

import { BasicSettings } from "./menus/BasicSettings";
import { AboutTeatime } from "./menus/AboutTeatime";
import { ProviderManagement } from "./menus/ProviderManagement";
import { ModelManagement } from "./menus/ModelManagement";
import { AgentManagement } from "./menus/agent/AgentManagement";
import { KeyboardShortcuts } from "./menus/KeyboardShortcuts";
import { WorkspaceSettings } from "./menus/Workspace";
import { CommandAllowlist } from "./menus/CommandAllowlist";
import ProjectTest from "./menus/ProjectTest";

type SettingsMenuKey =
  | "basic"
  | "about"
  | "models"
  | "keys"
  | "agents"
  | "workspace"
  | "shortcuts"
  | "whitelist"
  | "projectTest";

const MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> = [
  { key: "basic", label: "基础", Icon: SlidersHorizontal, Component: BasicSettings },
  { key: "workspace", label: "工作空间", Icon: Building2, Component: WorkspaceSettings },
  { key: "models", label: "模型", Icon: Boxes, Component: ModelManagement },
  { key: "keys", label: "服务商", Icon: KeyRound, Component: ProviderManagement },
  { key: "whitelist", label: "白名单", Icon: ShieldCheck, Component: CommandAllowlist },
  { key: "agents", label: "Agent", Icon: Bot, Component: AgentManagement },
  { key: "shortcuts", label: "快捷键", Icon: Keyboard, Component: KeyboardShortcuts },
  { key: "projectTest", label: "测试", Icon: FlaskConical, Component: ProjectTest },
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
  const [openTooltipKey, setOpenTooltipKey] = useState<SettingsMenuKey | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);

  const setTabMinLeftWidth = useTabs((s) => s.setTabMinLeftWidth);
  const activeTabId = useTabs((s) => s.activeTabId);
  const isActiveTab = activeTabId === tabId;

  useEffect(() => {
    setTabMinLeftWidth(tabId, 500);
    return () => setTabMinLeftWidth(tabId, undefined);
  }, [tabId, setTabMinLeftWidth]);

  useEffect(() => {
    if (isActiveTab) return;
    setOpenTooltipKey(null);
  }, [isActiveTab]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Update collapse state based on width on the next animation frame.
    const applyCollapseState = (width: number) => {
      const nextCollapsed = width < 700;
      if (lastCollapsedRef.current === nextCollapsed) return;
      lastCollapsedRef.current = nextCollapsed;
      setIsCollapsed(nextCollapsed);
    };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      // ResizeObserver 回调内只记录宽度，避免同步 setState 引发布局循环。
      pendingWidthRef.current = entry.contentRect.width;
      if (collapseRafRef.current !== null) return;
      collapseRafRef.current = window.requestAnimationFrame(() => {
        collapseRafRef.current = null;
        const width = pendingWidthRef.current;
        if (width == null) return;
        applyCollapseState(width);
      });
    });

    observer.observe(container);
    applyCollapseState(container.getBoundingClientRect().width);
    return () => {
      observer.disconnect();
      if (collapseRafRef.current !== null) {
        window.cancelAnimationFrame(collapseRafRef.current);
        collapseRafRef.current = null;
      }
    };
  }, []);

  const ActiveComponent = useMemo(
    () => MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey],
  );

  const menuGroups = useMemo(() => {
    const byKey = new Map(MENU.map((item) => [item.key, item]));
    return [
      [byKey.get("basic"), byKey.get("workspace")].filter(Boolean),
      [byKey.get("models"), byKey.get("keys"), byKey.get("whitelist"), byKey.get("agents")].filter(Boolean),
      [byKey.get("shortcuts"), byKey.get("projectTest"), byKey.get("about")].filter(Boolean),
    ] as Array<typeof MENU>;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-background"
    >
      <div className="flex h-full min-h-0">
        <div
          className={cn(
            "shrink-0 border-r border-border bg-muted/20",
            isCollapsed ? "w-[60px]" : "w-[192px]",
          )}
        >
          <div className="h-full overflow-auto">
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
          </div>
        </div>

        <div className="min-w-[400px] flex-1">
          <div className="h-full overflow-auto">
            <div className="p-3 pr-1">
              <div key={activeKey}>
                <ActiveComponent />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
