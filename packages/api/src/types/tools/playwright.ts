import { z } from "zod";

/**
 * Playwright / CDP Browser Tools（LLM 友好版）
 *
 * 设计目标：
 * - 最小集合 + 高覆盖率：用少量工具覆盖“观察-行动-等待-验证-诊断-页面控制”闭环
 * - LLM 友好：默认依赖 take-snapshot 产出的 uid，而不是脆弱的 CSS selector
 * - 输出可控：所有工具默认返回短且结构化的结果，避免上下文/DB 膨胀
 * - 权限边界清晰：仅允许控制 open-url 打开的页面；禁止创建新标签页/窗口
 */

const pageTargetId = z.string().min(1).describe("必填：逻辑页面 ID（由 open-url 传入/返回）。");

/**
 * 目标标签页的 CDP targetId（即 open-url 返回的 cdpTargetId）。
 * 重要：工具层使用该字段精确 attach，避免多 tab / 同 URL 串页。
 */
const targetId = z
  .string()
  .min(1)
  .describe("必填：目标标签页的 CDP targetId（open-url 返回的 cdpTargetId）。");

/**
 * 兼容输入别名：用户可能会传入 `tagetId`（拼写错误）。
 * - 说明：LLM 在生成参数时容易拼错字段名，这里做一次容错映射，避免无谓失败。
 */
function withTargetId<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => {
    if (!val || typeof val !== "object") return val;
    const obj = val as any;
    if (obj.targetId) return obj;
    if (obj.tagetId) return { ...obj, targetId: obj.tagetId };
    return obj;
  }, schema);
}

// 约定：uid 使用 CDP Accessibility 节点的 backendDOMNodeId（数字转字符串）。
const uid = z
  .string()
  .min(1)
  .regex(/^\d+$/)
  .describe("元素 uid（backendDOMNodeId，数字字符串；来自 take-snapshot）。");

const uidArg = z.object({ uid });

export const playwrightSnapshotToolDef = {
  id: "playwright-snapshot",
  description:
    "观察：获取页面可访问性快照（精简文本 + 可操作元素提示），用于让 agent 以文本方式理解页面并生成稳定的 Playwright selector（推荐 role selector）。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      verbose: z.boolean().optional().describe("是否返回更详细的快照（默认 false）。"),
      maxChars: z
        .number()
        .int()
        .min(1000)
        .max(50_000)
        .optional()
        .describe("快照最大字符数（默认由服务端控制）。"),
    }),
  ),
  component: null,
} as const;

export const playwrightActToolDef = {
  id: "playwright-act",
  description:
    "行动：对页面元素执行统一动作（推荐使用 snapshot 输出的 role selector；避免依赖脆弱的 CSS selector）。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      action: z.enum([
        "click",
        "dblclick",
        "fill",
        "type",
        "hover",
        "press",
        "select",
        "check",
        "uncheck",
        "scrollIntoView",
      ]),
      selector: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Playwright selector（推荐 role selector：`role=button[name=\"Submit\"]`；也可 css=.../text=...）。",
        ),
      value: z.string().optional().describe("fill/type/select 时使用。"),
      key: z.string().optional().describe("press 时使用，例如 Enter / Control+A / Escape。"),
    }),
  ),
  component: null,
} as const;

export const playwrightWaitToolDef = {
  id: "playwright-wait",
  description: "同步：等待页面条件（URL/文本/selector/load/networkidle/timeout）。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      type: z.enum(["url", "text", "selector", "load", "networkidle", "timeout"]),
      url: z.string().min(1).optional().describe("type=url 时使用：URL 子串（includes）。"),
      text: z.string().min(1).optional().describe("type=text 时使用：等待正文包含该文本。"),
      selector: z.string().min(1).optional().describe("type=selector 时使用。"),
      timeoutMs: z.number().int().min(0).optional().describe("超时（ms），默认由服务端控制。"),
    }),
  ),
  component: null,
} as const;

export const playwrightVerifyToolDef = {
  id: "playwright-verify",
  description:
    "验证：结构化断言页面状态（避免 LLM 自己拼断言导致不稳定）。返回 pass/fail 与简短证据。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      type: z.enum(["urlIncludes", "titleIncludes", "textIncludes", "elementExists", "elementEnabled"]),
      url: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      text: z.string().min(1).optional(),
      selector: z.string().min(1).optional(),
    }),
  ),
  component: null,
} as const;

export const playwrightDiagnosticsToolDef = {
  id: "playwright-diagnostics",
  description:
    "诊断：在失败时快速获取证据（console/network 摘要、url/title），用于让 agent 自救。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      target: z.enum(["urlTitle", "consoleRecent", "networkRecent", "networkFailedRecent"]),
      limit: z.number().int().min(1).max(200).optional().describe("返回条数（默认 50）。"),
    }),
  ),
  component: null,
} as const;

export const playwrightPageToolDef = {
  id: "playwright-page",
  description: "页面控制：在当前页面导航/刷新/前进/后退（不创建新页面）。",
  parameters: withTargetId(
    z.object({
      pageTargetId,
      targetId,
      action: z.enum(["navigate", "reload", "back", "forward"]),
      url: z.string().min(1).optional().describe("action=navigate 时使用。"),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
      timeoutMs: z.number().int().min(0).optional().describe("超时（ms）。"),
    }),
  ),
  component: null,
} as const;
