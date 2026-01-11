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
  SlidersHorizontal,
  Info,
  Keyboard,
  Building2,
  ShieldCheck,
  FlaskConical,
  Database,
  Sparkles,
} from "lucide-react";

import { BasicSettings } from "./menus/BasicSettings";
import { AboutTenas } from "./menus/AboutTenas";
import { ProviderManagement } from "./menus/ProviderManagement";
import { ObjectStorageService } from "./menus/ObjectStorageService";
import { AgentManagement } from "./menus/agent/AgentManagement";
import { KeyboardShortcuts } from "./menus/KeyboardShortcuts";
import { WorkspaceSettings } from "./menus/Workspace";
import { CommandAllowlist } from "./menus/CommandAllowlist";
import TestSetting from "./menus/TestSetting";
import { TenasSettingsLayout } from "@/components/ui/tenas/TenasSettingsLayout";
import {
  TenasSettingsMenu,
  type TenasSettingsMenuItem,
} from "@/components/ui/tenas/TenasSettingsMenu";

type SettingsMenuKey =
  | "basic"
  | "about"
  | "keys"
  | "storage"
  | "agents"
  | "workspace"
  | "shortcuts"
  | "whitelist"
  | "projectTest";

const DEV_MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> =
  process.env.NODE_ENV === "development"
    ? [{ key: "projectTest", label: "测试", Icon: FlaskConical, Component: TestSetting }]
    : [];

const MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> = [
  { key: "basic", label: "基础", Icon: SlidersHorizontal, Component: BasicSettings },
  { key: "workspace", label: "工作空间", Icon: Building2, Component: WorkspaceSettings },
  { key: "keys", label: "AI模型服务", Icon: Sparkles, Component: ProviderManagement },
  { key: "storage", label: "S3存储服务", Icon: Database, Component: ObjectStorageService },
  { key: "whitelist", label: "白名单", Icon: ShieldCheck, Component: CommandAllowlist },
  { key: "agents", label: "Agent", Icon: Bot, Component: AgentManagement },
  { key: "shortcuts", label: "快捷键", Icon: Keyboard, Component: KeyboardShortcuts },
  ...DEV_MENU,
  { key: "about", label: "关于Tenas", Icon: Info, Component: AboutTenas },
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
      byKey.get("keys"),
      byKey.get("storage"),
      byKey.get("whitelist"),
      byKey.get("agents"),
    ].filter(Boolean);
    const group3 = [
      byKey.get("shortcuts"),
      byKey.get("projectTest"),
      byKey.get("about"),
    ].filter(Boolean);
    return [group1, group2, group3] as TenasSettingsMenuItem[][];
  }, []);

  /** Persist the active menu into the dock base params. */
  const handleMenuChange = (nextKey: SettingsMenuKey) => {
    setActiveKey(nextKey);
    if (!tabId) return;
    // 切换菜单时同步写入 base.params，确保刷新后可恢复。
    setTabBaseParams(tabId, { settingsMenu: nextKey });
  };

  return (
    <TenasSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      contentWrapperClassName="min-w-[400px]"
      contentInnerClassName="p-3 pr-1"
      menu={
        <TenasSettingsMenu
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
