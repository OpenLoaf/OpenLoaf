import { z } from "zod";

/** Json render display tool definition. */
export const jsonRenderToolDef = {
  id: "json-render",
  name: "JSON 渲染展示",
  description:
    "触发：当你需要在聊天中以结构化卡片展示信息时调用。用途：渲染只读的结构化内容卡片（表格、摘要、配置预览等）。返回：null（纯展示，无交互）。不适用：需要用户填写/提交数据时请使用 request-user-input；禁止用它渲染大量文字内容（长文请直接输出或用普通消息展示）。",
  parameters: z.object({
    actionName: z.string().min(1).describe("动作名称，由调用方指定。"),
    tree: z.object({
      root: z.string().min(1).describe("结构树根节点 id。"),
      elements: z
        .object({})
        .catchall(z.unknown())
        .describe("结构树节点集合（节点 id -> 节点定义）。"),
    }),
    initialData: z
      .object({})
      .catchall(z.unknown())
      .optional()
      .describe("可选：初始展示数据。"),
  }),
  component: null,
} as const;
