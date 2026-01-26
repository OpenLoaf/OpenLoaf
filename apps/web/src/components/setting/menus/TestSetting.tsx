import { Button } from "@tenas-ai/ui/button";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
} from "@tenas-ai/api/common";
import { useTabs } from "@/hooks/use-tabs";
import { Globe } from "lucide-react";
import { memo } from "react";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { TenasSettingsField } from "@tenas-ai/ui/tenas/TenasSettingsField";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { toast } from "sonner";
import { useTerminalStatus } from "@/hooks/use-terminal-status";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { Switch } from "@tenas-ai/ui/switch";

/** Setup entry route. */
const STEP_UP_ROUTE = "/step-up";

const TestSetting = memo(function TestSetting() {
  /** Active workspace info. */
  const { workspace } = useWorkspace();
  const { basic, setBasic } = useBasicConfig();
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeStackCount = useTabs((s) => {
    const id = s.activeTabId;
    const tab = id ? s.tabs.find((t) => t.id === id) : undefined;
    return tab?.stack?.length ?? 0;
  });
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const clearStack = useTabs((s) => s.clearStack);
  const upsertToolPart = useTabs((s) => s.upsertToolPart);

  /** Terminal feature status reported by server. */
  const terminalStatus = useTerminalStatus();
  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" &&
      navigator.userAgent.includes("Electron"));

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
    const rootUri = workspace?.rootUri;
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

  /**
   * Toggle chat preface viewer button.
   */
  function handleToggleChatPreface(checked: boolean) {
    // 逻辑：实时控制 Chat Header 是否展示 Preface 查看按钮。
    void setBasic({ chatPrefaceEnabled: checked });
  }

  return (
    <div className="space-y-6">
      <TenasSettingsGroup title="实验功能">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Stack Demo</div>
              <div className="text-xs text-muted-foreground">
                快速创建用于测试的 stack 卡片
              </div>
            </div>
            <TenasSettingsField className="flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={handleCreateThreeStacks}>
                Stack: Create 3 (demo)
              </Button>
              <Button
                size="sm"
                variant="outline"
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">面板模拟</div>
              <div className="text-xs text-muted-foreground">
                触发内置面板或浏览器窗口
              </div>
            </div>
            <TenasSettingsField className="flex-wrap gap-2">
              {terminalStatus.enabled ? (
                <Button size="sm" variant="outline" onClick={handleOpenWorkspaceTerminal}>
                  Stack: Terminal (workspace)
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
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
                    variant="outline"
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
                    variant="outline"
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
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">画布调试信息</div>
              <div className="text-xs text-muted-foreground">
                显示性能面板（FPS/裁剪/帧时间）
              </div>
            </div>
            <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
              <Switch
                checked={Boolean(basic.boardDebugEnabled)}
                onCheckedChange={(checked) => {
                  // 逻辑：实时切换画布调试面板显示状态。
                  void setBasic({ boardDebugEnabled: checked });
                }}
                aria-label="Board debug overlay"
              />
            </TenasSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">显示 Chat Preface</div>
              <div className="text-xs text-muted-foreground">
                控制 Chat Header 是否显示 Preface 查看按钮
              </div>
            </div>
            <TenasSettingsField className="w-full sm:w-64 shrink-0 justify-end">
              <Switch
                checked={Boolean(basic.chatPrefaceEnabled)}
                onCheckedChange={handleToggleChatPreface}
                aria-label="Chat preface viewer"
              />
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="操作">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="text-sm font-medium">重新进入初始化</div>
            <TenasSettingsField>
              <Button type="button" variant="outline" size="sm" onClick={handleRestartSetup}>
                进入
              </Button>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>

      <TenasSettingsGroup title="Stack 状态">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">当前 Stack</div>
              <div className="text-xs text-muted-foreground">
                当前 tab 的 stack items 数量
              </div>
            </div>
            <TenasSettingsField className="gap-3">
              <span className="text-xs text-muted-foreground tabular-nums">
                {activeStackCount}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!activeTabId) return;
                  clearStack(activeTabId);
                }}
                disabled={activeStackCount === 0}
              >
                清空
              </Button>
            </TenasSettingsField>
          </div>
        </div>
      </TenasSettingsGroup>
    </div>
  );
});

export default TestSetting;
