import { Button } from "@/components/ui/button";
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  useTabs,
} from "@/hooks/use-tabs";
import { Globe } from "lucide-react";
import { memo } from "react";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { toast } from "sonner";
import { useTerminalStatus } from "@/hooks/use-terminal-status";

const TestSetting = memo(function TestSetting() {
  /** Active workspace info. */
  const { workspace } = useWorkspace();
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
    const terminalKey = `terminal:${rootUri}`;
    pushStackItem(activeTabId, {
      id: terminalKey,
      sourceKey: terminalKey,
      component: "terminal-viewer",
      title: "Terminal",
      params: { pwdUri: rootUri },
    });
  }

  return (
    <div className="space-y-6">
      <TeatimeSettingsGroup title="实验功能">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Stack Demo</div>
              <div className="text-xs text-muted-foreground">
                快速创建用于测试的 stack 卡片
              </div>
            </div>
            <TeatimeSettingsField className="flex-wrap gap-2">
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
            </TeatimeSettingsField>
          </div>

          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">面板模拟</div>
              <div className="text-xs text-muted-foreground">
                触发内置面板或浏览器窗口
              </div>
            </div>
            <TeatimeSettingsField className="flex-wrap gap-2">
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
                        params: { url: "https://inside.hexems.com", autoOpen: true },
                        title: "Browser Window",
                      });
                    }}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    Stack: BrowserWindow
                  </Button>
                </>
              ) : null}
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup title="Stack 状态">
        <div className="divide-y divide-border">
          <div className="flex flex-wrap items-start gap-3 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">当前 Stack</div>
              <div className="text-xs text-muted-foreground">
                当前 tab 的 stack items 数量
              </div>
            </div>
            <TeatimeSettingsField className="gap-3">
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
            </TeatimeSettingsField>
          </div>
        </div>
      </TeatimeSettingsGroup>
    </div>
  );
});

export default TestSetting;
