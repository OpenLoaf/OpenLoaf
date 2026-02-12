import { z } from 'zod'

export const generateWidgetToolDef = {
  id: 'generate-widget',
  name: '生成动态 Widget',
  description:
    '触发：当你需要生成一个可用的动态桌面 Widget，并把完整文件写入本地时调用。用途：写入 package.json/widget.tsx/functions.ts/.env 等文件并注册到桌面组件库。返回：成功提示字符串，包含生成目录与 .env 填写提示（如有）；失败会报错。不适用：仅需示例代码或不希望写入文件时不要使用。',
  needsApproval: true,
  parameters: z.object({
    actionName: z
      .string()
      .min(1)
      .describe('由调用的 LLM 传入，用于说明本次工具调用目的，例如：生成特斯拉股票 Widget。'),
    widgetId: z
      .string()
      .min(1)
      .describe('Widget 唯一标识符，格式：dw_<snake_case_name>_<timestamp>'),
    packageJson: z
      .string()
      .min(1)
      .describe('package.json 文件内容（JSON 字符串）'),
    widgetTsx: z
      .string()
      .min(1)
      .describe('widget.tsx React 组件源码'),
    functionsTs: z
      .string()
      .min(1)
      .describe('functions.ts 数据获取函数源码'),
    dotEnv: z
      .string()
      .optional()
      .describe('.env 环境变量文件内容（可选，包含 API Key 占位符）'),
  }),
  component: null,
} as const
