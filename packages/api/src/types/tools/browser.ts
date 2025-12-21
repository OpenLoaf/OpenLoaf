import { z } from "zod";

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
