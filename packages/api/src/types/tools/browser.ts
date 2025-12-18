import { z } from "zod";

export const openUrlToolDef = {
  id: "open-url",
  description:
    "在用户当前 Tab 中打开一个网址（以左侧 stack overlay 的方式打开 BrowserWindow）。需要 Electron runtime 在线；仅负责打开页面，不做其它网页操作。",
  parameters: z.object({
    url: z.string().describe("要打开的 URL（支持 https/http）"),
    title: z.string().optional().describe("标题，用于面板显示"),
    pageTargetId: z
      .string()
      .default(() => String(Date.now()))
      .describe(
        "必填：页面目标ID（用于后续 Playwright 工具精确指向该页面）。不传则默认使用当前时间戳。",
      ),
  }),
  component: null,
} as const;

export const uiCloseStackToolDef = {
  id: "ui-close-stack",
  description:
    "关闭用户当前 Tab 的左侧 stack overlay（不影响 base）。需要 Electron runtime 在线。",
  parameters: z.object({}),
  component: null,
} as const;

export const uiRefreshPageTreeToolDef = {
  id: "ui-refresh-page-tree",
  description:
    "刷新用户当前 Tab 的 Page Tree（通常用于侧边栏页面树）。需要 Electron runtime 在线。",
  parameters: z.object({}),
  component: null,
} as const;

export const uiRefreshBasePanelToolDef = {
  id: "ui-refresh-base-panel",
  description:
    "刷新用户当前 Tab 的 base 面板（通过触发 remount）。需要 Electron runtime 在线。",
  parameters: z.object({}),
  component: null,
} as const;

export const browserGetTabsToolDef = {
  id: "browser-get-tabs",
  description: "获取用户当前可见的 tabs（MVP：仅包含 activeTab）。",
  parameters: z.object({}),
  component: null,
} as const;

export const browserGetCurrentTabToolDef = {
  id: "browser-get-current-tab",
  description: "获取用户当前激活的 tab（MVP）。",
  parameters: z.object({}),
  component: null,
} as const;
