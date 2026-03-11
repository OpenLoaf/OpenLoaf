/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Button } from "@openloaf/ui/button";
import { useQuery } from "@tanstack/react-query";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
} from "@openloaf/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import type { LucideIcon } from "lucide-react";
import { Bug, Globe, Layers, Monitor, RefreshCw } from "lucide-react";
import { memo, useState, useCallback, useEffect } from "react";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { toast } from "sonner";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@openloaf/ui/switch";
import { isElectronEnv } from "@/utils/is-electron-env";
import { trpc } from "@/utils/trpc";

/** Flat-color icon badge for settings items. */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

/** Setup entry route. */
const STEP_UP_ROUTE = "/step-up";

const TestSetting = memo(function TestSetting() {
  const { basic, setBasic } = useBasicConfig();
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  });
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeStackCount = useTabRuntime((s) => {
    const runtime = activeTabId ? s.runtimeByTabId[activeTabId] : undefined;
    return runtime?.stack?.length ?? 0;
  });
  const pushStackItem = useTabRuntime((s) => s.pushStackItem);
  const clearStack = useTabRuntime((s) => s.clearStack);
  const upsertToolPart = useChatRuntime((s) => s.upsertToolPart);

  /** Terminal feature status reported by server. */
  const terminalStatus = useTerminalStatus();
  const isElectron = isElectronEnv();

  const [webContentsViewCount, setWebContentsViewCount] = useState<number | null>(null);

  const fetchWebContentsViewCount = useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.getWebContentsViewCount) return;
    try {
      const res = await api.getWebContentsViewCount();
      if (res?.ok) setWebContentsViewCount(res.count);
    } catch {
      // ignore
    }
  }, [isElectron]);

  const clearWebContentsViews = useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.clearWebContentsViews) return;
    try {
      const res = await api.clearWebContentsViews();
      if (res?.ok) setWebContentsViewCount(0);
      await fetchWebContentsViewCount();
    } catch {
      // ignore
    }
  }, [isElectron, fetchWebContentsViewCount]);

  useEffect(() => {
    if (!isElectron) return;
    void fetchWebContentsViewCount();
    const onFocus = () => void fetchWebContentsViewCount();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isElectron, fetchWebContentsViewCount]);

  /**
   * Pushes 3 demo stack items into the active tab for quick UI testing.
   */
  function handleCreateThreeStacks() {
    if (!activeTabId) return;

    // 这里用三个 tool-result 作为通用 demo（非 Electron 环境也能正常渲染）。
    for (let index = 0; index < 3; index += 1) {
      const toolKey = `demo:${Date.now()}:${index + 1}`;
      upsertToolPart(activeTabId, toolKey, {
        type: "tool-demo",
        title: `Demo Result #${index + 1}`,
        input: { from: "TestSetting", index: index + 1 },
        output: {
          ok: true,
          message: "批量创建 stack：pushStackItem -> ToolResultPanel 渲染成功",
          timestamp: new Date().toISOString(),
        },
      });
      pushStackItem(activeTabId, {
        id: `tool-demo:${toolKey}`,
        component: "tool-result",
        params: { toolKey },
        title: `Tool Result (demo #${index + 1})`,
      });
    }
  }

  /**
   * Opens a Terminal stack at the workspace root directory.
   */
  function handleOpenWorkspaceTerminal() {
    if (!activeTabId) return;
    if (terminalStatus.isLoading) {
      toast.message("正在获取终端状态");
      return;
    }
    if (!terminalStatus.enabled) {
      toast.error("终端功能未开启");
      return;
    }
    const rootUri = workspaceCompatQuery.data?.rootUri;
    if (!rootUri) {
      toast.error("未找到工作区目录");
      return;
    }
    // 中文注释：终端使用 workspace root 作为 pwd。
    pushStackItem(activeTabId, {
      id: TERMINAL_WINDOW_PANEL_ID,
      sourceKey: TERMINAL_WINDOW_PANEL_ID,
      component: TERMINAL_WINDOW_COMPONENT,
      title: "Terminal",
      params: {
        __customHeader: true,
        __open: { pwdUri: rootUri },
      },
    });
  }

  /**
   * Restarts the setup flow from the beginning.
   */
  async function handleRestartSetup() {
    // 流程说明：先重置初始化标记，再跳转到初始化页面。
    // 若写入失败或发生异常，也直接跳转，确保不会卡在当前页。
    try {
      await setBasic({ stepUpInitialized: false });
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign(STEP_UP_ROUTE);
      }
    }
  }

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title="实验功能">
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Layers} bg="bg-sky-500/10" fg="text-sky-600 dark:text-sky-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Stack Demo</div>
              <div className="text-xs text-muted-foreground">
                快速创建用于测试的 stack 卡片
              </div>
            </div>
            <OpenLoafSettingsField className="flex-wrap gap-2">
              <Button size="sm" className="rounded-full bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 dark:text-sky-400 shadow-none" onClick={handleCreateThreeStacks}>
                Stack: Create 3 (demo)
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 dark:text-slate-400 shadow-none"
                onClick={() => {
                  if (!activeTabId) return;
                  const toolKey = `demo:${Date.now()}`;
                  upsertToolPart(activeTabId, toolKey, {
                    type: "tool-demo",
                    title: "Demo Result",
                    input: { from: "TestSetting" },
                    output: {
                      ok: true,
                      message: "pushStackItem -> ToolResultPanel 渲染成功",
                      timestamp: new Date().toISOString(),
                    },
                  });
                  pushStackItem(activeTabId, {
                    id: `tool-demo:${toolKey}`,
                    component: "tool-result",
                    params: { toolKey },
                    title: "Tool Result (demo)",
                  });
                }}
              >
                Stack: Tool Result (demo)
              </Button>
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Monitor} bg="bg-violet-500/10" fg="text-violet-600 dark:text-violet-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">面板模拟</div>
              <div className="text-xs text-muted-foreground">
                触发内置面板或浏览器窗口
              </div>
            </div>
            <OpenLoafSettingsField className="flex-wrap gap-2">
              {terminalStatus.enabled ? (
                <Button size="sm" className="rounded-full bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 dark:text-slate-400 shadow-none" onClick={handleOpenWorkspaceTerminal}>
                  Stack: Terminal (workspace)
                </Button>
              ) : null}
              <Button
                size="sm"
                className="rounded-full bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 dark:text-slate-400 shadow-none"
                onClick={() => {
                  if (!activeTabId) return;
                  pushStackItem(activeTabId, {
                    id: "project:current",
                    component: "plant-page",
                    params: {},
                    title: "Project (overlay)",
                  });
                }}
              >
                Stack: Project (overlay)
              </Button>

              {isElectron ? (
                <>
                  <Button
                    size="sm"
                    className="rounded-full bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 dark:text-slate-400 shadow-none"
                    onClick={() => {
                      if (!activeTabId) return;
                      pushStackItem(activeTabId, {
                        id: `browser:${Date.now()}`,
                        component: "electron-browser",
                        params: { url: "https://inside.hexems.com" },
                        title: "Browser",
                      });
                    }}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Stack: Browser
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-slate-500/10 text-slate-600 hover:bg-slate-500/20 dark:text-slate-400 shadow-none"
                    onClick={() => {
                      if (!activeTabId) return;
                      pushStackItem(activeTabId, {
                        id: BROWSER_WINDOW_PANEL_ID,
                        sourceKey: BROWSER_WINDOW_PANEL_ID,
                        component: BROWSER_WINDOW_COMPONENT,
                        params: {
                          __customHeader: true,
                          __open: { url: "https://inside.hexems.com" },
                          autoOpen: true,
                        },
                        title: "Browser Window",
                      });
                    }}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Stack: BrowserWindow
                  </Button>
                </>
              ) : null}
            </OpenLoafSettingsField>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Bug} bg="bg-amber-500/10" fg="text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">画布调试信息</div>
              <div className="text-xs text-muted-foreground">
                显示性能面板（FPS/裁剪/帧时间）
              </div>
            </div>
            <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
              <Switch
                checked={Boolean(basic.boardDebugEnabled)}
                onCheckedChange={(checked) => {
                  // 逻辑：实时切换画布调试面板显示状态。
                  void setBasic({ boardDebugEnabled: checked });
                }}
                aria-label="Board debug overlay"
              />
            </OpenLoafSettingsField>
          </div>

        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title="操作">
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={RefreshCw} bg="bg-amber-500/10" fg="text-amber-600 dark:text-amber-400" />
            <div className="text-sm font-medium">重新进入初始化</div>
            <OpenLoafSettingsField>
              <Button type="button" size="sm" className="rounded-full bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 shadow-none" onClick={handleRestartSetup}>
                进入
              </Button>
            </OpenLoafSettingsField>
          </div>
          {isElectron ? (
            <div className="flex flex-wrap items-center gap-2 py-3">
              <SettingIcon icon={Monitor} bg="bg-slate-500/10" fg="text-slate-600 dark:text-slate-400" />
              <div className="text-sm font-medium">WebContentsView 数</div>
              <OpenLoafSettingsField className="max-w-[70%] gap-2">
                <button
                  type="button"
                  aria-label="点击刷新"
                  title="点击刷新"
                  className="text-right bg-transparent p-0 text-xs truncate text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                  onClick={() => void fetchWebContentsViewCount()}
                >
                  {webContentsViewCount == null ? "—" : String(webContentsViewCount)}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs rounded-full"
                  aria-label="清除"
                  disabled={webContentsViewCount == null || webContentsViewCount === 0}
                  onClick={() => void clearWebContentsViews()}
                >
                  清除
                </Button>
              </OpenLoafSettingsField>
            </div>
          ) : null}
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title="Stack 状态">
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Layers} bg="bg-emerald-500/10" fg="text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">当前 Stack</div>
              <div className="text-xs text-muted-foreground">
                当前 tab 的 stack items 数量
              </div>
            </div>
            <OpenLoafSettingsField className="gap-3">
              <span className="text-xs text-muted-foreground tabular-nums">
                {activeStackCount}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => {
                  if (!activeTabId) return;
                  clearStack(activeTabId);
                }}
                disabled={activeStackCount === 0}
              >
                清空
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
});

export default TestSetting;
