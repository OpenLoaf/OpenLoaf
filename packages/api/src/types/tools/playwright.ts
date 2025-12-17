import { z } from "zod";

const MAX_SCRIPT_CHARS = 20_000;
const MAX_DSL_STEPS = 200;

const urlMatch = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("exact"), url: z.string() }),
  z.object({ mode: z.literal("includes"), url: z.string() }),
  z.object({ mode: z.literal("regex"), pattern: z.string() }),
]);

const loadState = z.enum(["load", "domcontentloaded", "networkidle"]);
const waitUntil = z.enum(["load", "domcontentloaded", "networkidle"]);

const screenshotOptions = z.object({
  fullPage: z.boolean().optional(),
  type: z.enum(["png", "jpeg"]).optional(),
  quality: z.number().int().min(0).max(100).optional().describe("仅 jpeg 生效。"),
  omitBackground: z.boolean().optional(),
});

const routeHandler = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("continue") }),
  z.object({ mode: z.literal("abort"), errorCode: z.string().optional() }),
  z.object({
    mode: z.literal("fulfill"),
    status: z.number().int().min(100).max(599).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    json: z.unknown().optional(),
  }),
]);

const dslStep = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("goto"),
      url: z.string().min(1).describe("在当前页面中导航到新的 URL（不会打开新 tab/page）。"),
      waitUntil: waitUntil.optional(),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("waitForLoadState"),
      state: loadState.optional(),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("waitForURL"),
      urlMatch,
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("getInfo"),
      fields: z
        .array(z.enum(["url", "title"]))
        .min(1)
        .describe("一次性获取多个页面信息字段。"),
    }),
    // 注意：为了避免超大输出（base64 截图），DSL 不提供 screenshot。

    z.object({
      type: z.literal("click"),
      selector: z
        .string()
        .min(1)
        .describe(
          "Playwright selector（支持引擎前缀，例如 css=, xpath=, text=, role= 等；也支持纯 CSS）。",
        ),
      button: z.enum(["left", "right", "middle"]).optional(),
      clickCount: z.number().int().min(1).optional(),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("dblclick"),
      selector: z.string().min(1),
      button: z.enum(["left", "right", "middle"]).optional(),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({ type: z.literal("hover"), selector: z.string().min(1), timeoutMs: z.number().int().min(0).optional() }),
    z.object({
      type: z.literal("fill"),
      selector: z.string().min(1),
      text: z.string().describe("要填入的文本（等价于 Playwright fill 的 value）。"),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("type"),
      selector: z.string().min(1),
      text: z.string(),
      delayMs: z.number().int().min(0).optional(),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("press"),
      selector: z.string().min(1),
      key: z.string().min(1).describe("例如 Enter / Control+A"),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({ type: z.literal("check"), selector: z.string().min(1), timeoutMs: z.number().int().min(0).optional() }),
    z.object({
      type: z.literal("uncheck"),
      selector: z.string().min(1),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("selectOption"),
      selector: z.string().min(1),
      values: z.array(z.string().min(1)).min(1),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("setInputFiles"),
      selector: z.string().min(1),
      filePaths: z.array(z.string().min(1)).min(1),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("scrollIntoView"),
      selector: z.string().min(1),
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("getElement"),
      selector: z.string().min(1),
      fields: z
        .array(
          z.enum([
            "textContent",
            "innerText",
            "innerHTML",
            "value",
            "isVisible",
            "isEnabled",
            "isChecked",
            "count",
          ]),
        )
        .min(1),
      timeoutMs: z.number().int().min(0).optional(),
    }),

    z.object({
      type: z.literal("evaluate"),
      expression: z
        .string()
        .min(1)
        .max(MAX_SCRIPT_CHARS)
        .describe("在页面上下文执行的 JS 表达式/代码（建议返回可 JSON 序列化数据）。"),
      arg: z.unknown().optional(),
    }),
    z.object({ type: z.literal("addInitScript"), script: z.string().min(1).max(MAX_SCRIPT_CHARS) }),
    z.object({ type: z.literal("addScriptTag"), content: z.string().min(1).max(MAX_SCRIPT_CHARS) }),
    z.object({ type: z.literal("addStyleTag"), content: z.string().min(1).max(MAX_SCRIPT_CHARS) }),

    z.object({ type: z.literal("cookies.get"), urls: z.array(z.string().min(1)).optional() }),
    z.object({
      type: z.literal("cookies.add"),
      cookies: z
        .array(
          z.object({
            name: z.string(),
            value: z.string(),
            url: z.string().optional(),
            domain: z.string().optional(),
            path: z.string().optional(),
            expires: z.number().optional(),
            httpOnly: z.boolean().optional(),
            secure: z.boolean().optional(),
            sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
          }),
        )
        .min(1),
    }),
    z.object({ type: z.literal("cookies.clear") }),
    z.object({
      type: z.literal("storageState.get"),
      path: z.string().optional().describe("可选：将 storageState 写入该路径（是否支持取决于实现）。"),
    }),
    z.object({ type: z.literal("localStorage.get"), keys: z.array(z.string().min(1)).optional() }),
    z.object({
      type: z.literal("localStorage.set"),
      entries: z.record(z.string(), z.string()),
    }),
    z.object({ type: z.literal("localStorage.remove"), keys: z.array(z.string().min(1)).min(1) }),
    z.object({ type: z.literal("localStorage.clear") }),
    z.object({ type: z.literal("sessionStorage.get"), keys: z.array(z.string().min(1)).optional() }),
    z.object({
      type: z.literal("sessionStorage.set"),
      entries: z.record(z.string(), z.string()),
    }),
    z.object({ type: z.literal("sessionStorage.remove"), keys: z.array(z.string().min(1)).min(1) }),
    z.object({ type: z.literal("sessionStorage.clear") }),

    z.object({
      type: z.literal("waitForRequest"),
      urlMatch,
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("waitForResponse"),
      urlMatch,
      timeoutMs: z.number().int().min(0).optional(),
    }),
    z.object({
      type: z.literal("route.add"),
      urlMatch: urlMatch.describe("要拦截的请求 URL 匹配规则。"),
      handler: routeHandler,
    }),
    z.object({ type: z.literal("route.clear") }),
    z.object({
      type: z.literal("capture.start"),
      includeHeaders: z.boolean().optional(),
      maxEntries: z.number().int().min(1).max(10_000).optional(),
    }),
    z.object({ type: z.literal("capture.stop") }),
    z.object({ type: z.literal("capture.get") }),
    z.object({ type: z.literal("capture.clear") }),
  ])
  .describe("Playwright DSL step。");

export const playwrightDslToolDef = {
  id: "playwright-dsl",
  description:
    "执行一段 Playwright DSL 脚本（JSON steps 数组）来自动化“open-url 打开的嵌入浏览器页面”。工具不负责打开/切换标签页，且必须指定 `pageTargetId` 来精确指向目标页面。",
  parameters: z.object({
    pageTargetId: z
      .string()
      .min(1)
      .describe("必填：目标页面 ID（由 open-url 返回）。"),
    steps: z.array(dslStep).min(1).max(MAX_DSL_STEPS),
    options: z
      .object({
        stopOnError: z.boolean().optional().describe("遇到错误是否立即停止（默认 true，由实现决定）。"),
        timeoutMs: z.number().int().min(0).optional().describe("可选：整个 DSL 流程总超时（ms）。"),
      })
      .optional(),
    note: z.string().max(2000).optional().describe("可选：本次 DSL 执行意图说明，便于日志与回放。"),
  }),
  component: null,
} as const;

export const playwrightGetAccessibilityTreeToolDef = {
  id: "playwright-get-accessibility-tree",
  description:
    "获取指定页面的 Accessibility Tree（用于让 agent 以文本方式理解页面结构与可交互元素）。必须指定 `pageTargetId`。",
  parameters: z.object({
    pageTargetId: z.string().min(1).describe("必填：目标页面 ID（由 open-url 返回）。"),
    interestingOnly: z
      .boolean()
      .optional()
      .describe("是否只返回“有意义”的节点（Playwright 默认行为类似 true）。"),
  }),
  component: null,
} as const;

export const playwrightRuntimeEvaluateToolDef = {
  id: "playwright-runtime-evaluate",
  description:
    "通过 Chrome DevTools Protocol 的 Runtime.evaluate 在页面里执行表达式，并返回结果（适合调试/探测）。必须指定 `pageTargetId`。",
  parameters: z.object({
    pageTargetId: z.string().min(1).describe("必填：目标页面 ID（由 open-url 返回）。"),
    expression: z
      .string()
      .min(1)
      .max(MAX_SCRIPT_CHARS)
      .describe("要执行的 JS expression（CDP Runtime.evaluate）。"),
    awaitPromise: z.boolean().optional().describe("是否等待 Promise（默认 true）。"),
    returnByValue: z.boolean().optional().describe("是否按值返回（默认 true）。"),
  }),
  component: null,
} as const;

export const playwrightDomSnapshotToolDef = {
  id: "playwright-dom-snapshot",
  description:
    "通过 Chrome DevTools Protocol 的 DOMSnapshot.captureSnapshot 获取 DOM Snapshot（用于结构分析/调试）。必须指定 `pageTargetId`。",
  parameters: z.object({
    pageTargetId: z.string().min(1).describe("必填：目标页面 ID（由 open-url 返回）。"),
    computedStyles: z
      .array(z.string().min(1))
      .optional()
      .describe("要采集的 computed style 字段名数组（不传则为空数组）。"),
    includeDOMRects: z.boolean().optional().describe("是否包含 DOM rect 信息。"),
    includePaintOrder: z.boolean().optional().describe("是否包含 paint order 信息。"),
  }),
  component: null,
} as const;

export const playwrightNetworkGetResponseBodyToolDef = {
  id: "playwright-network-get-response-body",
  description:
    "通过 Chrome DevTools Protocol 的 Network.getResponseBody 获取某个 requestId 的响应体。必须指定 `pageTargetId`。",
  parameters: z.object({
    pageTargetId: z.string().min(1).describe("必填：目标页面 ID（由 open-url 返回）。"),
    requestId: z.string().min(1).describe("CDP Network requestId（需要你从 Network 事件或日志中获得）。"),
  }),
  component: null,
} as const;
