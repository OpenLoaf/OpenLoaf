/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openloaf/ui/tooltip";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useBasicConfig } from "@/hooks/use-basic-config";
import {
  Bot,
  Cpu,
  SlidersHorizontal,
  Info,
  Keyboard,
  Building2,
  FlaskConical,
  Database,
  Sparkles,
  Wand2Icon,
  Terminal,
} from "lucide-react";

import { BasicSettings } from "./menus/BasicSettings";
import { AboutOpenLoaf } from "./menus/AboutOpenLoaf";
import { ProviderManagement } from "./menus/ProviderManagement";
import { ObjectStorageService } from "./menus/ObjectStorageService";
import { AgentManagement } from "./menus/agent/AgentManagement";
import { AuxiliaryModelSettings } from "./menus/AuxiliaryModelSettings";
import { KeyboardShortcuts } from "./menus/KeyboardShortcuts";
import { WorkspaceSettings } from "./menus/Workspace";
import TestSetting from "./menus/TestSetting";
import { SkillSettings } from "./menus/SkillSettings";
import { ThirdPartyTools } from "./menus/ThirdPartyTools";
import { OpenLoafSettingsLayout } from "@openloaf/ui/openloaf/OpenLoafSettingsLayout";
import {
  OpenLoafSettingsMenu,
  type OpenLoafSettingsMenuItem,
} from "@openloaf/ui/openloaf/OpenLoafSettingsMenu";
import { cn } from "@/lib/utils";

type SettingsMenuKey =
  | "basic"
  | "about"
  | "keys"
  | "storage"
  | "agents"
  | "auxiliaryModel"
  | "workspace"
  | "skills"
  | "thirdPartyTools"
  | "shortcuts"
  | "projectTest";

const SETTINGS_MENU_ICON_COLOR = {
  basic: "text-[#1a73e8] dark:text-sky-300",
  workspace: "text-[#5f6368] dark:text-slate-300",
  skills: "text-[#9334e6] dark:text-violet-300",
  thirdPartyTools: "text-[#188038] dark:text-emerald-300",
  keys: "text-[#9334e6] dark:text-violet-300",
  storage: "text-[#188038] dark:text-emerald-300",
  agents: "text-[#1a73e8] dark:text-sky-300",
  auxiliaryModel: "text-[#188038] dark:text-emerald-300",
  shortcuts: "text-[#f9ab00] dark:text-amber-300",
  projectTest: "text-[#f4511e] dark:text-orange-300",
  about: "text-[#5f6368] dark:text-slate-300",
} as const;

/** Build a menu icon component with fixed email-style color tone. */
function createMenuIcon(
  Icon: ComponentType<{ className?: string }>,
  colorClassName: string,
): ComponentType<{ className?: string }> {
  return function MenuIcon({ className }: { className?: string }) {
    return <Icon className={cn(colorClassName, className)} />;
  };
}

function buildMenu(t: (key: string) => string): Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> {
  const DEV_MENU = process.env.NODE_ENV === "development"
    ? [
        {
          key: "projectTest" as SettingsMenuKey,
          label: t('settings:menu.projectTest'),
          Icon: createMenuIcon(FlaskConical, SETTINGS_MENU_ICON_COLOR.projectTest),
          Component: TestSetting,
        },
      ]
    : [];

  return [
    {
      key: "basic",
      label: t('settings:menu.basic'),
      Icon: createMenuIcon(SlidersHorizontal, SETTINGS_MENU_ICON_COLOR.basic),
      Component: BasicSettings,
    },
    {
      key: "workspace",
      label: t('settings:menu.workspace'),
      Icon: createMenuIcon(Building2, SETTINGS_MENU_ICON_COLOR.workspace),
      Component: WorkspaceSettings,
    },
    {
      key: "skills",
      label: t('settings:menu.skills'),
      Icon: createMenuIcon(Wand2Icon, SETTINGS_MENU_ICON_COLOR.skills),
      Component: SkillSettings,
    },
    {
      key: "thirdPartyTools",
      label: t('settings:menu.thirdPartyTools'),
      Icon: createMenuIcon(Terminal, SETTINGS_MENU_ICON_COLOR.thirdPartyTools),
      Component: ThirdPartyTools,
    },
    {
      key: "keys",
      label: t('settings:menu.keys'),
      Icon: createMenuIcon(Sparkles, SETTINGS_MENU_ICON_COLOR.keys),
      Component: ProviderManagement,
    },
    {
      key: "storage",
      label: t('settings:menu.storage'),
      Icon: createMenuIcon(Database, SETTINGS_MENU_ICON_COLOR.storage),
      Component: ObjectStorageService,
    },
    {
      key: "agents",
      label: t('settings:menu.agents'),
      Icon: createMenuIcon(Bot, SETTINGS_MENU_ICON_COLOR.agents),
      Component: AgentManagement,
    },
    {
      key: "auxiliaryModel",
      label: t('settings:menu.auxiliaryModel'),
      Icon: createMenuIcon(Cpu, SETTINGS_MENU_ICON_COLOR.auxiliaryModel),
      Component: AuxiliaryModelSettings,
    },
    {
      key: "shortcuts",
      label: t('settings:menu.shortcuts'),
      Icon: createMenuIcon(Keyboard, SETTINGS_MENU_ICON_COLOR.shortcuts),
      Component: KeyboardShortcuts,
    },
    ...DEV_MENU,
    {
      key: "about",
      label: t('settings:menu.about'),
      Icon: createMenuIcon(Info, SETTINGS_MENU_ICON_COLOR.about),
      Component: AboutOpenLoaf,
    },
  ];
}

const ALL_MENU_KEYS: SettingsMenuKey[] = [
  'basic', 'workspace', 'skills', 'thirdPartyTools', 'keys', 'storage', 'agents', 'auxiliaryModel', 'shortcuts', 'about', 'projectTest',
];
const MENU_KEY_SET = new Set<SettingsMenuKey>(ALL_MENU_KEYS);
const HIDDEN_MENU_KEYS = new Set<SettingsMenuKey>([]);

/** Check whether the value is a valid settings menu key. */
function isSettingsMenuKey(value: unknown): value is SettingsMenuKey {
  if (typeof value !== "string") return false;
  return MENU_KEY_SET.has(value as SettingsMenuKey);
}

/** Check whether the value is a visible settings menu key. */
function isVisibleSettingsMenuKey(value: unknown): value is SettingsMenuKey {
  if (!isSettingsMenuKey(value)) return false;
  return !HIDDEN_MENU_KEYS.has(value);
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
  const { t } = useTranslation('settings');
  const MENU = useMemo(() => buildMenu((key) => t(key)), [t]);
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>(() =>
    isVisibleSettingsMenuKey(settingsMenu) ? settingsMenu : "basic",
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openTooltipKey, setOpenTooltipKey] = useState<SettingsMenuKey | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const collapseRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const lastCollapsedRef = useRef<boolean | null>(null);
  const { basic } = useBasicConfig();
  const shouldAnimate = basic.uiAnimationLevel !== "low";

  const setTabMinLeftWidth = useTabRuntime((s) => s.setTabMinLeftWidth);
  const setTabBaseParams = useTabRuntime((s) => s.setTabBaseParams);
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
    if (!isVisibleSettingsMenuKey(settingsMenu)) return;
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
    const filterVisible = (item?: OpenLoafSettingsMenuItem | null) =>
      Boolean(item && !HIDDEN_MENU_KEYS.has(item.key as SettingsMenuKey));
    const group1 = [
      byKey.get("basic"),
      byKey.get("workspace"),
      byKey.get("shortcuts"),
      byKey.get("projectTest"),
      byKey.get("thirdPartyTools"),
      byKey.get("about"),
    ].filter(filterVisible);
    const group2 = [
      byKey.get("agents"),
      byKey.get("auxiliaryModel"),
      byKey.get("skills"),
      byKey.get("keys"),
      byKey.get("storage"),
    ].filter(filterVisible);
    return [group1, group2].filter((group) => group.length > 0) as OpenLoafSettingsMenuItem[][];
  }, [MENU]);

  /** Persist the active menu into the dock base params. */
  const handleMenuChange = (nextKey: SettingsMenuKey) => {
    setActiveKey(nextKey);
    if (!tabId) return;
    // 切换菜单时同步写入 base.params，确保刷新后可恢复。
    setTabBaseParams(tabId, { settingsMenu: nextKey });
  };

  return (
    <OpenLoafSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      contentWrapperClassName="min-w-[400px]"
      contentInnerClassName="p-3 pr-1"
      menu={
        <OpenLoafSettingsMenu
          groups={menuGroups}
          activeKey={activeKey}
          isCollapsed={isCollapsed}
          onChange={(key) => handleMenuChange(key as SettingsMenuKey)}
          renderItemWrapper={(item, button) => {
            const tooltipEnabled = isCollapsed && isActiveTab;
            if (!tooltipEnabled) return button;
            return (
              <Tooltip
                delayDuration={200}
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
        <div
          key={activeKey}
          className={cn(
            "h-full min-h-0 flex flex-col",
            shouldAnimate &&
              "settings-animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out",
          )}
        >
          <ActiveComponent />
        </div>
      }
    />
  );
}
