import { z } from 'zod'

export const generateWidgetToolDef = {
  id: 'generate-widget',
  name: '生成动态 Widget',
  description:
    'Generates a dynamic desktop widget by writing all required files (package.json, widget.tsx, functions.ts, .env) to ~/.tenas/dynamic-widgets/<widgetId>/. The widget will appear in the desktop widget library under "AI 生成" section.',
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
