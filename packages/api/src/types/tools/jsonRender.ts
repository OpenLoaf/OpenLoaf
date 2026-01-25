import { z } from "zod";

/** Json render approval tool definition. */
export const jsonRenderToolDef = {
  id: "json-render",
  name: "JSON 渲染表单",
  description: "Use UITree to render a form. Use action 'submit' or 'cancel'.",
  parameters: z.object({
    actionName: z.string().min(1).describe("动作名称，由调用方指定。"),
    tree: z.object({
      root: z.string().min(1).describe("UITree 根节点 id。"),
      elements: z.object({}).catchall(z.unknown()).describe("UITree 节点集合。"),
    }),
    initialData: z
      .object({})
      .catchall(z.unknown())
      .optional()
      .describe("可选：初始表单数据。"),
  }),
  needsApproval: true,
  component: null,
} as const;
