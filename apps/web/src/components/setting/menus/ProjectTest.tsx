import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { Globe } from "lucide-react";
import { memo } from "react";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";

const ProjectTest = memo(function ProjectTest() {
  const activeTabId = useTabs((s) => s.activeTabId);
  const activeStackCount = useTabs((s) => {
    const id = s.activeTabId;
    const tab = id ? s.tabs.find((t) => t.id === id) : undefined;
    return tab?.stack?.length ?? 0;
  });
  const pushStackItem = useTabs((s) => s.pushStackItem);
  const clearStack = useTabs((s) => s.clearStack);
  const upsertToolPart = useTabs((s) => s.upsertToolPart);

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
        input: { from: "ProjectTest", index: index + 1 },
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
                    input: { from: "ProjectTest" },
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
                        id: `browser-window:${Date.now()}`,
                        component: "electron-browser-window",
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

export default ProjectTest;
