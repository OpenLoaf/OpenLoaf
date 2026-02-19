import { z } from 'zod'

// ─── 新工具定义 ───

export const widgetInitToolDef = {
  id: 'widget-init',
  name: '初始化 Widget 脚手架',
  description:
    '创建 widget 目录脚手架（package.json + 占位 widget.tsx + 占位 functions.ts + 可选 .env）。返回 widgetId 和文件路径，随后用 apply-patch 写入实际代码。',
  needsApproval: true,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('本次工具调用目的，例如：初始化天气 Widget 脚手架'),
    widgetName: z
      .string()
      .min(1)
      .describe('Widget 名称，kebab-case，如 "tesla-stock"'),
    widgetDescription: z
      .string()
      .min(1)
      .describe('Widget 中文描述'),
    size: z
      .object({
        defaultW: z.number().default(4),
        defaultH: z.number().default(2),
        minW: z.number().default(2),
        minH: z.number().default(2),
        maxW: z.number().default(6),
        maxH: z.number().default(4),
      })
      .optional()
      .describe(
        '尺寸（Desktop Grid 单位：列×行）。参考：clock 2x2, calendar 4x2, ai-chat 5x6',
      ),
    functionNames: z
      .array(z.string())
      .min(1)
      .describe('服务端函数名列表（仅名称，不含实现）'),
    envVars: z
      .array(
        z.object({
          key: z.string(),
          placeholder: z.string(),
          comment: z.string().optional(),
        }),
      )
      .optional()
      .describe('环境变量列表'),
  }),
  component: null,
} as const

export const widgetListToolDef = {
  id: 'widget-list',
  name: '列出所有 Widget',
  description:
    '列出当前 workspace/project 下所有动态 Widget 的基本信息（widgetId、名称、描述、函数列表等）。',
  needsApproval: false,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('本次工具调用目的，例如：查看已有 Widget 列表'),
  }),
  component: null,
} as const

export const widgetGetToolDef = {
  id: 'widget-get',
  name: '获取 Widget 详情',
  description:
    '获取单个 Widget 的详细信息，包括元数据、函数列表、尺寸约束、环境变量等。',
  needsApproval: false,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('本次工具调用目的，例如：查看天气 Widget 详情'),
    widgetId: z
      .string()
      .min(1)
      .describe('Widget ID，如 "dw_weather_1234567890"'),
  }),
  component: null,
} as const

export const widgetCheckToolDef = {
  id: 'widget-check',
  name: '验证 Widget',
  description:
    '验证 Widget 文件结构并编译 widget.tsx。成功时前端会显示 Widget 预览。',
  needsApproval: false,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('本次工具调用目的，例如：验证天气 Widget'),
    widgetId: z
      .string()
      .min(1)
      .describe('Widget ID，如 "dw_weather_1234567890"'),
  }),
  component: null,
} as const

// ─── 旧工具定义（向后兼容） ───

export const generateWidgetToolDef = {
  id: 'generate-widget',
  name: '生成动态 Widget',
  description:
    '触发：当你需要生成一个可用的动态桌面 Widget，并把完整文件写入本地时调用。用途：写入 package.json/widget.tsx/functions.ts/.env 等文件并注册到桌面组件库。返回：JSON（含 widgetId）；失败会报错。不适用：仅需示例代码或不希望写入文件时不要使用。',
  needsApproval: true,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe(
        '由调用的 LLM 传入，用于说明本次工具调用目的，例如：生成特斯拉股票 Widget。',
      ),
    widgetName: z
      .string()
      .min(1)
      .describe('Widget 名称，kebab-case，如 "tesla-stock"'),
    widgetDescription: z
      .string()
      .min(1)
      .describe('Widget 中文描述'),
    size: z
      .object({
        defaultW: z.number().default(4),
        defaultH: z.number().default(2),
        minW: z.number().default(2),
        minH: z.number().default(2),
        maxW: z.number().default(6),
        maxH: z.number().default(4),
      })
      .optional()
      .describe(
        '尺寸（Desktop Grid 单位：列×行）。参考：clock 2x2, calendar 4x2, ai-chat 5x6',
      ),
    functions: z
      .array(
        z.object({
          name: z.string().describe('函数名'),
          implementation: z
            .string()
            .describe('函数体代码（不含签名，直接写函数内部逻辑）'),
        }),
      )
      .min(1)
      .describe('服务端函数列表'),
    uiCode: z
      .string()
      .min(1)
      .describe(
        'JSX 渲染部分。可用变量：data/loading/error/theme/sdk。根元素保持 h-full。',
      ),
    envVars: z
      .array(
        z.object({
          key: z.string(),
          placeholder: z.string(),
          comment: z.string().optional(),
        }),
      )
      .optional()
      .describe('环境变量列表'),
    refreshInterval: z
      .number()
      .optional()
      .describe('自动轮询间隔（ms），默认 60000'),
  }),
  component: null,
} as const
