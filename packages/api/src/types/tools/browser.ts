import { z } from "zod";

export const openUrlToolDef = {
  id: "open-url",
  description: "在当前 Tab 打开一个网址，并在左侧 stack 中展示（Electron WebContentsView）。",
  parameters: z.object({
    url: z.string().min(1).describe("要打开的 URL（支持 https/http）。"),
    title: z.string().optional().describe("面板标题（可选）。"),
  }),
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
