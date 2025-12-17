import { tool, zodSchema } from "ai";
import { z } from "zod";
import { emitOpenUrl } from "@/chat/uiEvents";

export const uiTools = {
  open_url: tool({
    description:
      "在用户当前 Tab 中打开一个网址（以左侧 stack overlay 的方式打开 BrowserWindow）。仅负责打开页面，不做其它网页操作。",
    inputSchema: zodSchema(
      z.object({
        url: z.string().describe("要打开的 URL（支持 https/http）"),
        title: z.string().optional().describe("可选标题，用于面板显示"),
      })
    ),
    execute: async ({ url, title }) => {
      emitOpenUrl({ url, title });
      return { ok: true };
    },
  }),
};

