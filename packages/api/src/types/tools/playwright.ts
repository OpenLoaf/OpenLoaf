import { z } from "zod";

/**
 * Playwright / CDP Browser Tools (MVP)
 *
 * 设计目标：
 * - 参考 chrome-devtools-mcp 的「snapshot + uid 操作」交互方式
 * - 默认返回尽可能短的结果，避免 tool 输出过长导致上下文/DB 膨胀
 * - 只允许控制 open-url 打开的单页（通过 pageTargetId 绑定）
 * - 禁止打开新页面（不提供 new_page / new tab 能力）
 */

const pageTargetId = z
  .string()
  .min(1)
  .describe("必填：目标页面 ID（由 open-url 返回/传入）。");

// 约定：uid 使用 CDP Accessibility 节点的 backendDOMNodeId（数字转字符串）。
const uid = z
  .string()
  .min(1)
  .regex(/^\d+$/)
  .describe("元素 uid（backendDOMNodeId，数字字符串；来自 take-snapshot）。");

const uidArg = z.object({ uid });

export const playwrightTakeSnapshotToolDef = {
  id: "playwright-take-snapshot",
  description:
    "获取当前页面的可访问性快照（Accessibility Tree 的精简文本），用于让 agent 以文本方式理解页面结构，并得到可操作元素的 uid。",
  parameters: z.object({
    pageTargetId,
    verbose: z
      .boolean()
      .optional()
      .describe("是否返回更详细的快照（默认 false，避免输出过长）。"),
    maxChars: z
      .number()
      .int()
      .min(1000)
      .max(50_000)
      .optional()
      .describe("快照最大字符数（默认由服务端控制）。"),
  }),
  component: null,
} as const;

export const playwrightClickToolDef = {
  id: "playwright-click",
  description: "点击指定 uid 的元素（不允许打开新页面；如产生 popup 将被自动关闭）。",
  parameters: z.object({
    pageTargetId,
    uid,
    dblClick: z.boolean().optional().describe("是否双击（默认 false）。"),
  }),
  component: null,
} as const;

export const playwrightHoverToolDef = {
  id: "playwright-hover",
  description: "Hover 指定 uid 的元素。",
  parameters: z.object({
    pageTargetId,
    uid,
  }),
  component: null,
} as const;

export const playwrightDragToolDef = {
  id: "playwright-drag",
  description: "拖拽：把 from_uid 元素拖到 to_uid 元素上。",
  parameters: z.object({
    pageTargetId,
    from_uid: uid,
    to_uid: uid,
  }),
  component: null,
} as const;

export const playwrightFillToolDef = {
  id: "playwright-fill",
  description: "向指定 uid 的输入元素填入文本（会先全选清空再输入）。",
  parameters: z.object({
    pageTargetId,
    uid,
    value: z.string().describe("要填入的值。"),
  }),
  component: null,
} as const;

export const playwrightFillFormToolDef = {
  id: "playwright-fill-form",
  description: "批量填写多个输入元素（按顺序依次 focus/清空/输入）。",
  parameters: z.object({
    pageTargetId,
    elements: z
      .array(
        z.object({
          uid,
          value: z.string(),
        }),
      )
      .min(1)
      .max(50),
  }),
  component: null,
} as const;

export const playwrightPressKeyToolDef = {
  id: "playwright-press-key",
  description: "在当前页面发送键盘按键/组合键（例如 Enter / Control+A）。",
  parameters: z.object({
    pageTargetId,
    key: z.string().min(1).describe("例如 Enter / Control+A / Escape"),
  }),
  component: null,
} as const;

export const playwrightNavigatePageToolDef = {
  id: "playwright-navigate-page",
  description:
    "在当前页面执行导航（仅影响当前 page，不创建新 page）。type=url 时必须提供 url。",
  parameters: z.object({
    pageTargetId,
    type: z.enum(["url", "reload", "back", "forward"]),
    url: z.string().optional().describe("当 type=url 时的目标 URL。"),
    ignoreCache: z.boolean().optional().describe("reload 时是否忽略缓存。"),
    timeoutMs: z.number().int().min(0).optional().describe("超时（ms）。"),
  }),
  component: null,
} as const;

export const playwrightWaitForToolDef = {
  id: "playwright-wait-for",
  description: "等待页面正文中出现指定文本（用于同步/等待页面状态）。",
  parameters: z.object({
    pageTargetId,
    text: z.string().min(1),
    timeoutMs: z.number().int().min(0).optional(),
  }),
  component: null,
} as const;

export const playwrightEvaluateScriptToolDef = {
  id: "playwright-evaluate-script",
  description:
    "在页面里执行 JS 函数（CDP Runtime.callFunctionOn / Runtime.evaluate）。默认只返回小结果，避免超长输出。",
  parameters: z.object({
    pageTargetId,
    function: z
      .string()
      .min(1)
      .max(20_000)
      .describe(
        "要执行的 JS 函数声明字符串，例如：`() => document.title` 或 `async () => (await fetch(...)).text()`",
      ),
    args: z
      .array(uidArg)
      .optional()
      .describe("可选：传入 take-snapshot 得到的元素 uid 作为参数。"),
    awaitPromise: z.boolean().optional().describe("是否等待 Promise（默认 true）。"),
    returnByValue: z.boolean().optional().describe("是否按值返回（默认 true）。"),
  }),
  component: null,
} as const;

export const playwrightDomSnapshotToolDef = {
  id: "playwright-dom-snapshot",
  description:
    "获取 DOMSnapshot.captureSnapshot 的摘要信息（不会返回原始 snapshot，避免超大输出）。",
  parameters: z.object({
    pageTargetId,
    computedStyles: z.array(z.string().min(1)).optional(),
    includeDOMRects: z.boolean().optional(),
    includePaintOrder: z.boolean().optional(),
  }),
  component: null,
} as const;

export const playwrightListNetworkRequestsToolDef = {
  id: "playwright-list-network-requests",
  description:
    "列出最近捕获到的网络请求（摘要）。用于拿到 requestId，再配合 get-response-body 获取响应体预览。",
  parameters: z.object({
    pageTargetId,
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("返回条数（默认 50，避免输出过长）。"),
    kind: z
      .enum(["request", "response", "all"])
      .optional()
      .describe("过滤类型：仅 request / 仅 response / all（默认 all）。"),
  }),
  component: null,
} as const;

export const playwrightGetNetworkRequestToolDef = {
  id: "playwright-get-network-request",
  description: "按 requestId 获取某条网络请求/响应的摘要信息（不返回大字段）。",
  parameters: z.object({
    pageTargetId,
    requestId: z.string().min(1),
  }),
  component: null,
} as const;

export const playwrightNetworkGetResponseBodyToolDef = {
  id: "playwright-network-get-response-body",
  description:
    "获取 Network.getResponseBody 的摘要/预览（不会返回完整 body，避免超大输出）。",
  parameters: z.object({
    pageTargetId,
    requestId: z.string().min(1),
  }),
  component: null,
} as const;

export const playwrightListConsoleMessagesToolDef = {
  id: "playwright-list-console-messages",
  description: "列出最近捕获到的 console 日志（摘要）。",
  parameters: z.object({
    pageTargetId,
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("返回条数（默认 50，避免输出过长）。"),
    types: z
      .array(z.string().min(1))
      .optional()
      .describe("可选：过滤类型，例如 log/warn/error/debug。"),
  }),
  component: null,
} as const;

export const playwrightGetConsoleMessageToolDef = {
  id: "playwright-get-console-message",
  description: "按 msgId 获取某条 console 日志详情（会做长度截断）。",
  parameters: z.object({
    pageTargetId,
    msgId: z.number().int().min(0),
  }),
  component: null,
} as const;

export const playwrightStorageToolDef = {
  id: "playwright-storage",
  description:
    "读取/写入 localStorage 或 sessionStorage（默认只返回小结果，避免上下文溢出）。",
  parameters: z.object({
    pageTargetId,
    storage: z.enum(["localStorage", "sessionStorage"]),
    op: z.enum(["keys", "get", "set", "remove", "clear"]),
    keys: z.array(z.string().min(1)).optional().describe("get/remove 时使用。"),
    entries: z
      .record(z.string().min(1), z.string())
      .optional()
      .describe("set 时使用：key->value。"),
    includeValues: z
      .boolean()
      .optional()
      .describe("keys/get 是否返回 value（默认 false，避免输出过长）。"),
    maxValueChars: z
      .number()
      .int()
      .min(50)
      .max(10_000)
      .optional()
      .describe("单个 value 最大字符数（默认 2000）。"),
  }),
  component: null,
} as const;

export const playwrightCookiesToolDef = {
  id: "playwright-cookies",
  description:
    "读取页面 cookies（默认不返回完整 value；需要时可开启 includeValue）。",
  parameters: z.object({
    pageTargetId,
    includeValue: z
      .boolean()
      .optional()
      .describe("是否返回 cookie value（默认 false，避免敏感/超长输出）。"),
    maxValueChars: z
      .number()
      .int()
      .min(10)
      .max(2000)
      .optional()
      .describe("cookie value 预览最大字符数（默认 200）。"),
  }),
  component: null,
} as const;
