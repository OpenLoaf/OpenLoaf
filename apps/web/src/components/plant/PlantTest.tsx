import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use_tabs";
import { Globe } from "lucide-react";

interface PlantTestProps {
  pageId?: string;
}

export default function PlantTest({ pageId }: PlantTestProps) {
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

  return (
    <div className="px-2 py-2 space-y-2">
      <div className="text-xs text-muted-foreground">
        Stack items: {activeStackCount}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!activeTabId) return;
          const toolKey = `demo:${Date.now()}`;
          upsertToolPart(activeTabId, toolKey, {
            type: "tool-demo",
            title: "Demo Result",
            input: { from: "PlantTest", pageId: pageId ?? null },
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
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!activeTabId) return;
          pushStackItem(activeTabId, {
            id: `plant:${pageId ?? "current"}`,
            component: "plant-page",
            params: pageId ? { pageId } : {},
            title: "Plant (overlay)",
          });
        }}
      >
        Stack: Plant (overlay)
      </Button>
      {isElectron && (
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
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (!activeTabId) return;
          clearStack(activeTabId);
        }}
        disabled={activeStackCount === 0}
      >
        Clear stack
      </Button>
    </div>
  );
}
