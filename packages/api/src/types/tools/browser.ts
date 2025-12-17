import { z } from "zod";
import { id } from "zod/v4/locales";

export const openUrlToolDef = {
  id: "open-url",
  description:
    "在用户当前 Tab 中打开一个网址（以左侧 stack overlay 的方式打开 BrowserWindow）。仅负责打开页面，不做其它网页操作。",
  parameters: z.object({
    url: z.string().describe("要打开的 URL（支持 https/http）"),
    title: z.string().optional().describe("可选标题，用于面板显示"),
  }),
  component: null,
};

export const browserGetTabsToolDef = {
  description: "获取用户当前可见的 tabs（MVP：仅包含 activeTab）。",
  parameters: z.object({}),
  component: null,
};

export const browserGetCurrentTabToolDef = {
  description: "获取用户当前激活的 tab（MVP）。",
  parameters: z.object({}),
  component: null,
};