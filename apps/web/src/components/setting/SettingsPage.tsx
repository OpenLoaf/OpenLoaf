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
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useBasicConfig } from "@/hooks/use-basic-config";
import {
  Brain,
  Cpu,
  SlidersHorizontal,
  Keyboard,
  Building2,
  FlaskConical,
  Database,
  Sparkles,
  Terminal,
} from "lucide-react";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { Button } from "@openloaf/ui/button";
import {
  readPersistedSettingsMenu,
  writePersistedSettingsMenu,
} from "@/lib/settings-menu-storage";

import { BasicSettings } from "./menus/BasicSettings";

import { ProviderManagement } from "./menus/ProviderManagement";
import { ObjectStorageService } from "./menus/ObjectStorageService";
import { AuxiliaryModelSettings } from "./menus/AuxiliaryModelSettings";
import { KeyboardShortcuts } from "./menus/KeyboardShortcuts";
import { GlobalSettings } from "./menus/GlobalSettings";
import TestSetting from "./menus/TestSetting";
import { ThirdPartyTools } from "./menus/ThirdPartyTools";
import { MemorySettings } from "./menus/MemorySettings";
import { OpenLoafSettingsLayout } from "@openloaf/ui/openloaf/OpenLoafSettingsLayout";
import {
  OpenLoafSettingsMenu,
  type OpenLoafSettingsMenuItem,
} from "@openloaf/ui/openloaf/OpenLoafSettingsMenu";
import { cn } from "@/lib/utils";

type SettingsMenuKey =
  | "basic"
  | "keys"
  | "storage"
  | "auxiliaryModel"
  | "global"
  | "memory"
  | "thirdPartyTools"
  | "shortcuts"
  | "projectTest";

const SETTINGS_MENU_ICON_COLOR = {
  basic: "text-ol-blue",
  global: "text-ol-amber",
  shortcuts: "text-ol-text-auxiliary",
  keys: "text-ol-purple",
  auxiliaryModel: "text-ol-blue",
  memory: "text-ol-green",
  thirdPartyTools: "text-ol-text-auxiliary",
  storage: "text-ol-green",
  projectTest: "text-ol-amber",
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
    // Group 1: General
    {
      key: "basic",
      label: t('settings:menu.basic'),
      Icon: createMenuIcon(SlidersHorizontal, SETTINGS_MENU_ICON_COLOR.basic),
      Component: BasicSettings,
    },
    {
      key: "global",
      label: t('settings:menu.global'),
      Icon: createMenuIcon(Building2, SETTINGS_MENU_ICON_COLOR.global),
      Component: GlobalSettings,
    },
    {
      key: "shortcuts",
      label: t('settings:menu.shortcuts'),
      Icon: createMenuIcon(Keyboard, SETTINGS_MENU_ICON_COLOR.shortcuts),
      Component: KeyboardShortcuts,
    },
    // Group 2: AI
    {
      key: "keys",
      label: t('settings:menu.keys'),
      Icon: createMenuIcon(Sparkles, SETTINGS_MENU_ICON_COLOR.keys),
      Component: ProviderManagement,
    },
    {
      key: "auxiliaryModel",
      label: t('settings:menu.auxiliaryModel'),
      Icon: createMenuIcon(Cpu, SETTINGS_MENU_ICON_COLOR.auxiliaryModel),
      Component: AuxiliaryModelSettings,
    },
    {
      key: "memory",
      label: t('settings:menu.memory'),
      Icon: createMenuIcon(Brain, SETTINGS_MENU_ICON_COLOR.memory),
      Component: MemorySettings,
    },
    // Group 3: Services (in general group)
    {
      key: "thirdPartyTools",
      label: t('settings:menu.thirdPartyTools'),
      Icon: createMenuIcon(Terminal, SETTINGS_MENU_ICON_COLOR.thirdPartyTools),
      Component: ThirdPartyTools,
    },
    {
      key: "storage",
      label: t('settings:menu.storage'),
      Icon: createMenuIcon(Database, SETTINGS_MENU_ICON_COLOR.storage),
      Component: ObjectStorageService,
    },
    ...DEV_MENU,
  ];
}

const ALL_MENU_KEYS: SettingsMenuKey[] = [
  'basic', 'global', 'shortcuts', 'thirdPartyTools', 'storage', 'keys', 'auxiliaryModel', 'memory', 'projectTest',
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

/** Normalize persisted menu keys to current values. */
function normalizeSettingsMenuKey(value: unknown): SettingsMenuKey | null {
  return isVisibleSettingsMenuKey(value) ? value : null;
}

type SettingsPageProps = {
  panelKey?: string;
  tabId?: string;
  settingsMenu?: SettingsMenuKey;
};

export default function SettingsPage({
  panelKey: _panelKey,
  tabId,
  settingsMenu,
}: SettingsPageProps) {
  const { t } = useTranslation(['settings', 'nav']);
  const MENU = useMemo(() => buildMenu((key) => t(key)), [t]);
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>(() =>
    normalizeSettingsMenuKey(settingsMenu)
      ?? normalizeSettingsMenuKey(readPersistedSettingsMenu("global"))
      ?? "basic",
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
  const isDialogMode = !tabId;

  const activeItem = useMemo(
    () => MENU.find((item) => item.key === activeKey),
    [MENU, activeKey],
  );
  const activeLabel = activeItem?.label ?? t('nav:settings');
  const ActiveIcon = activeItem?.Icon;

  const setMinLeftWidth = useLayoutState((s) => s.setMinLeftWidth);
  const setBaseParams = useLayoutState((s) => s.setBaseParams);
  const setTitle = useAppView((s) => s.setTitle);
  const isActiveTab = true; // single-view mode, always active

  // Keep tab title in sync with current language.
  useEffect(() => {
    if (tabId) setTitle(t('nav:settings'));
  }, [tabId, t, setTitle]);

  useEffect(() => {
    if (!tabId) return;
    setMinLeftWidth(500);
    return () => setMinLeftWidth(undefined);
  }, [tabId, setMinLeftWidth]);

  useEffect(() => {
    if (isActiveTab) return;
    setOpenTooltipKey(null);
  }, [isActiveTab]);

  useEffect(() => {
    const normalizedMenu = normalizeSettingsMenuKey(settingsMenu);
    if (!normalizedMenu) return;
    if (normalizedMenu === activeKey) return;
    // 从持久化参数恢复上次选中的菜单，刷新后保持位置。
    setActiveKey(normalizedMenu);
  }, [settingsMenu, activeKey]);

  useEffect(() => {
    writePersistedSettingsMenu("global", activeKey);
    if (!tabId) return;
    if (settingsMenu === activeKey) return;
    // 中文注释：把当前菜单同步回 base params，保证刷新和恢复布局时能回到同一菜单。
    setBaseParams({ settingsMenu: activeKey });
  }, [activeKey, settingsMenu, setBaseParams, tabId]);

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
    const general = [
      byKey.get("basic"),
      byKey.get("global"),
      byKey.get("shortcuts"),
      byKey.get("thirdPartyTools"),
      byKey.get("storage"),
      byKey.get("projectTest"),
    ].filter(filterVisible);
    const ai = [
      byKey.get("keys"),
      byKey.get("auxiliaryModel"),
      byKey.get("memory"),
    ].filter(filterVisible);
    return [general, ai].filter((group) => group.length > 0) as OpenLoafSettingsMenuItem[][];
  }, [MENU]);

  /** Persist the active menu into the dock base params (only when used inside a tab). */
  const handleMenuChange = (nextKey: SettingsMenuKey) => {
    setActiveKey(nextKey);
    writePersistedSettingsMenu("global", nextKey);
    if (!tabId) return;
    setBaseParams({ settingsMenu: nextKey });
  };

  return (
    <OpenLoafSettingsLayout
      ref={containerRef}
      isCollapsed={isCollapsed}
      contentWrapperClassName="min-w-[400px]"
      contentInnerClassName="p-0"
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
        <div className="flex h-full min-h-0 flex-col">
          {isDialogMode && (
            <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-4 py-2">
              <h2 className="flex items-center gap-2 text-sm font-medium">
                {ActiveIcon && <ActiveIcon className="h-4 w-4" />}
                {activeLabel}
              </h2>
            </div>
          )}
          <div
            key={activeKey}
            className={cn(
              "flex-1 min-h-0 overflow-auto p-3 pr-1",
              shouldAnimate &&
                "settings-animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out",
            )}
          >
            <ActiveComponent />
          </div>
        </div>
      }
    />
  );
}
