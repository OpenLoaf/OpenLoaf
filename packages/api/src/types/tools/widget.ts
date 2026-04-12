/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

// ─── New tool definitions ───

export const widgetInitToolDef = {
  id: 'WidgetInit',
  readonly: false,
  name: 'Init Widget',
  description:
    'Scaffold a widget directory (package.json + placeholder widget.tsx + placeholder functions.ts + optional .env). Returns widgetId and file paths. See workbench-ops skill for usage.',
  needsApproval: true,
  parameters: z.object({
    widgetName: z
      .string()
      .min(1)
      .describe('kebab-case, e.g. "tesla-stock".'),
    widgetDescription: z.string().min(1),
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
      .describe('Desktop Grid units (cols × rows). Examples: clock 2x2, calendar 4x2, ai-chat 5x6.'),
    functionNames: z
      .array(z.string())
      .min(1)
      .describe('Server-side function names to scaffold (names only, no bodies).'),
    envVars: z
      .array(
        z.object({
          key: z.string(),
          placeholder: z.string(),
          comment: z.string().optional(),
        }),
      )
      .optional(),
  }),
  component: null,
} as const

export const widgetListToolDef = {
  id: 'WidgetList',
  readonly: true,
  name: 'List Widgets',
  description:
    'List all visible dynamic widgets with basic info (widgetId, name, description, functions). See workbench-ops skill for usage.',
  needsApproval: false,
  parameters: z.object({}),
  component: null,
} as const

export const widgetGetToolDef = {
  id: 'WidgetGet',
  readonly: true,
  name: 'Get Widget',
  description:
    'Get full metadata for a single widget (functions, size, env vars). See workbench-ops skill for usage.',
  needsApproval: false,
  parameters: z.object({
    widgetId: z.string().min(1).describe('e.g. "dw_weather_1234567890".'),
  }),
  component: null,
} as const

export const widgetCheckToolDef = {
  id: 'WidgetCheck',
  readonly: true,
  name: 'Check Widget',
  description:
    'Validate widget files and compile widget.tsx; shows the widget preview on success. See workbench-ops skill for usage.',
  needsApproval: false,
  parameters: z.object({
    widgetId: z.string().min(1).describe('e.g. "dw_weather_1234567890".'),
  }),
  component: null,
} as const

// ─── Legacy tool (backward compatibility) ───

export const generateWidgetToolDef = {
  id: 'GenerateWidget',
  readonly: false,
  name: 'Generate Widget',
  description:
    'Generate a complete dynamic desktop widget (package.json, widget.tsx, functions.ts, .env) and register it. Returns widgetId. See workbench-ops skill for usage.',
  needsApproval: true,
  parameters: z.object({
    widgetName: z
      .string()
      .min(1)
      .describe('kebab-case, e.g. "tesla-stock".'),
    widgetDescription: z.string().min(1),
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
      .describe('Desktop Grid units (cols × rows). Examples: clock 2x2, calendar 4x2, ai-chat 5x6.'),
    functions: z
      .array(
        z.object({
          name: z.string(),
          implementation: z
            .string()
            .describe('Function body without signature, just the inner logic.'),
        }),
      )
      .min(1),
    uiCode: z
      .string()
      .min(1)
      .describe('JSX rendering body. Available variables: data / loading / error / theme / sdk. Root element should keep h-full.'),
    envVars: z
      .array(
        z.object({
          key: z.string(),
          placeholder: z.string(),
          comment: z.string().optional(),
        }),
      )
      .optional(),
    refreshInterval: z.number().optional().describe('Milliseconds. Default 60000.'),
  }),
  component: null,
} as const
