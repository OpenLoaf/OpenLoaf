"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ComponentType } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { TeatimeSettingsLayout } from "@/components/ui/teatime/TeatimeSettingsLayout";
import {
  TeatimeSettingsMenu,
  type TeatimeSettingsMenuItem,
} from "@/components/ui/teatime/TeatimeSettingsMenu";

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

const MENU_KEY_SET = new Set<SettingsMenuKey>(MENU.map((item) => item.key));

/** Check whether the value is a valid settings menu key. */
function isSettingsMenuKey(value: unknown): value is SettingsMenuKey {
  if (typeof value !== "string") return false;
  return MENU_KEY_SET.has(value as SettingsMenuKey);
}

type SettingsPageProps = {
  panelKey: string;
  tabId: string;
  settingsMenu?: SettingsMenuKey;
};

export default function SettingsPage({
  panelKey: _panelKey,
  tabId,
  settingsMenu,
}: SettingsPageProps) {
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>(() =>
    isSettingsMenuKey(settingsMenu) ? settingsMenu : "basic",
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openTooltipKey, setOpenTooltipKey] = useState<SettingsMenuKey | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);

  const setTabMinLeftWidth = useTabs((s) => s.setTabMinLeftWidth);
  const setTabBaseParams = useTabs((s) => s.setTabBaseParams);
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
    if (!isSettingsMenuKey(settingsMenu)) return;
    if (settingsMenu === activeKey) return;
    // 从持久化参数恢复上次选中的菜单，刷新后保持位置。
    setActiveKey(settingsMenu);
  }, [settingsMenu, activeKey]);

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
    const group1 = [byKey.get("basic"), byKey.get("workspace")].filter(Boolean);
    const group2 = [
      byKey.get("models"),
      byKey.get("keys"),
      byKey.get("whitelist"),
      byKey.get("agents"),
    ].filter(Boolean);
    const group3 = [
      byKey.get("shortcuts"),
      byKey.get("projectTest"),
      byKey.get("about"),
    ].filter(Boolean);
    return [group1, group2, group3] as TeatimeSettingsMenuItem[][];
  }, []);

  /** Persist the active menu into the dock base params. */
  const handleMenuChange = (nextKey: SettingsMenuKey) => {
    setActiveKey(nextKey);
    if (!tabId) return;
    // 切换菜单时同步写入 base.params，确保刷新后可恢复。
    setTabBaseParams(tabId, { settingsMenu: nextKey });
  };

  return (
    <TeatimeSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      contentWrapperClassName="min-w-[400px]"
      contentInnerClassName="p-3 pr-1"
      menu={
        <TeatimeSettingsMenu
          groups={menuGroups}
          activeKey={activeKey}
          isCollapsed={isCollapsed}
          onChange={(key) => handleMenuChange(key as SettingsMenuKey)}
          renderItemWrapper={(item, button) => {
            const tooltipEnabled = isCollapsed && isActiveTab;
            if (!tooltipEnabled) return button;
            return (
              <Tooltip
                delayDuration={0}
                open={openTooltipKey === item.key}
                onOpenChange={(open) => {
                  if (open) {
                    setOpenTooltipKey(item.key as SettingsMenuKey);
                    return;
                  }
                  setOpenTooltipKey((prev) =>
                    prev === item.key ? null : prev,
                  );
                }}
              >
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }}
        />
      }
      content={
        <div key={activeKey}>
          <ActiveComponent />
        </div>
      }
    />
  );
}
