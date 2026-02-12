import { z } from "zod";

/** Json render approval tool definition. */
export const jsonRenderToolDef = {
  id: "json-render",
  name: "JSON 渲染表单",
  description:
    "触发：当你需要让用户在聊天中填写/确认结构化字段时调用。用途：按 mode 决定审批或只读展示，渲染表单卡片。返回：mode=approve 时提交返回字段对象（key-value），取消/拒绝无数据并中止；mode=display 时仅展示且返回 null。不适用：仅需自由文本或你能直接给出字段值时不要使用；禁止用它渲染大量文字内容（长文请直接输出或用普通消息展示）。",
  parameters: z.object({
    actionName: z.string().min(1).describe("动作名称，由调用方指定。"),
    mode: z
      .enum(["approve", "display"])
      .default("approve")
      .describe("审批或展示模式：approve 需要用户提交；display 仅展示不审批。"),
    tree: z.object({
      root: z.string().min(1).describe("表单结构树根节点 id。"),
      elements: z
        .object({})
        .catchall(z.unknown())
        .describe("表单结构树节点集合（节点 id -> 节点定义）。"),
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
