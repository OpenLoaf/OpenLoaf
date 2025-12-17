"use client";

import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use-tabs";
import { handleUiEvent } from "@/lib/chat/ui-event";
import { type DockItem } from "@teatime-ai/api/common";
import { uiEvents } from "@teatime-ai/api/types/event";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { toast } from "sonner";

type AnyToolPart = {
  input?: unknown;
  title?: string;
  toolName?: string;
};

/**
 * 从工具 input 中解析 open-url 的关键参数（兼容 unknown）。
 */
function getInput(input: unknown): { url?: string; title?: string; pageTargetId?: string } {
  if (!input || typeof input !== "object") return {};
  const record = input as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : undefined;
  const title = typeof record.title === "string" ? record.title : undefined;
  const pageTargetId =
    typeof record.pageTargetId === "string" ? record.pageTargetId : undefined;
  return { url, title, pageTargetId };
}

/**
 * 构造 BrowserWindow 对应的 DockItem（与 server 侧保持一致，便于幂等与去重）。
 */
function buildBrowserWindowDockItem({
  url,
  title,
  pageTargetId,
}: {
  url: string;
  title?: string;
  pageTargetId: string;
}): DockItem {
  return {
    id: `browser-window:${pageTargetId}`,
    sourceKey: `browser-window:${pageTargetId}`,
    component: "electron-browser-window",
    title: title ?? "Browser Window",
    params: { url, autoOpen: true, pageTargetId },
  };
}

/**
 * OpenUrl 工具在“历史/回放”场景的 UI 重执行组件。
 * - 说明：SSE 推送可以即时打开窗口，但历史消息不会再次触发；
 *   这里通过按钮把同样的 UI 行为（push stack item）在前端重放一遍。
 */
export default function OpenUrlTool({ part }: { part: AnyToolPart }) {
  const { url, title, pageTargetId } = getInput(part.input);
  const toolTitle = part.title ?? part.toolName ?? openUrlToolDef.id;

  /**
   * 重放 open-url：在当前激活 Tab 中打开 BrowserWindow。
   */
  const handleOpen = () => {
    if (!url) {
      toast.error("缺少 URL，无法执行 open-url");
      return;
    }

    const tabId = useTabs.getState().activeTabId;
    if (!tabId) {
      toast.error("没有激活的 Tab，无法执行 open-url");
      return;
    }

    handleUiEvent(
      uiEvents.pushStackItem({
        tabId,
        item: buildBrowserWindowDockItem({
          url,
          title,
          pageTargetId: pageTargetId ?? String(Date.now()),
        }),
      }),
    );
  };

  return (
    <div className="not-prose my-3 w-full min-w-0 max-w-[92%] rounded-lg border bg-card px-3 py-2 text-card-foreground shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-5 truncate">{toolTitle}</div>
          <div className="text-xs leading-4 text-muted-foreground truncate">
            {url ?? "（无 URL）"}
          </div>
        </div>
        <Button type="button" size="sm" onClick={handleOpen} disabled={!url}>
          打开
        </Button>
      </div>
    </div>
  );
}
