import type { z } from 'zod'
import type {
  generateWidgetToolDef,
  widgetInitToolDef,
} from '@openloaf/api/types/tools/widget'

type WidgetInput = z.infer<typeof generateWidgetToolDef.parameters>
type WidgetInitInput = z.infer<typeof widgetInitToolDef.parameters>

/** DesktopWidgetSize 枚举值 */
const VALID_SIZES = ['1x1', '2x2', '4x2', '4x3', '5x6'] as const

/** 从 defaultW × defaultH 映射到最近的 DesktopWidgetSize */
function toDesktopWidgetSize(w: number, h: number): string {
  const area = w * h
  let best: string = VALID_SIZES[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const s of VALID_SIZES) {
    const parts = s.split('x').map(Number)
    const sw = parts[0] ?? 0
    const sh = parts[1] ?? 0
    const dist = Math.abs(sw * sh - area) + Math.abs(sw - w) + Math.abs(sh - h)
    if (dist < bestDist) {
      bestDist = dist
      best = s
    }
  }
  return best
}

type SizeInput = {
  defaultW?: number
  defaultH?: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

function normalizeSize(s?: SizeInput) {
  const v = s ?? {}
  return {
    defaultW: v.defaultW ?? 4,
    defaultH: v.defaultH ?? 2,
    minW: v.minW ?? 2,
    minH: v.minH ?? 2,
    maxW: v.maxW ?? 6,
    maxH: v.maxH ?? 4,
  }
}

// ─── 新工具：占位模板 ───

/** 生成 package.json（新版：接受 functionNames 字符串数组） */
export function renderPackageJsonFromInit(input: WidgetInitInput): string {
  const size = normalizeSize(input.size)
  const scripts: Record<string, string> = {}
  for (const name of input.functionNames) {
    scripts[name] = `npx tsx functions.ts ${name}`
  }
  const pkg = {
    name: `dw-${input.widgetName}`,
    version: '1.0.0',
    description: input.widgetDescription,
    main: 'widget.tsx',
    scripts,
    openloaf: {
      type: 'widget',
      defaultSize: toDesktopWidgetSize(size.defaultW, size.defaultH),
      constraints: size,
      support: { workspace: true, project: true },
    },
  }
  return JSON.stringify(pkg, null, 2)
}

/** 可编译的占位 widget.tsx */
export function renderPlaceholderWidgetTsx(
  widgetName: string,
  firstFnName: string,
): string {
  return `import type { WidgetProps } from '@openloaf/widget-sdk'
import { useWidgetData, useWidgetTheme } from '@openloaf/widget-sdk'

export default function Widget({ sdk }: WidgetProps) {
  const { data, loading, error } = useWidgetData(sdk, '${firstFnName}', {
    refreshInterval: 60000,
  })
  const theme = useWidgetTheme(sdk)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-xs">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        <div className="text-xs">{error}</div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-xs">${widgetName} — 请用 apply-patch 写入实际组件代码</div>
    </div>
  )
}
`
}

/** 空函数桩 + dotenv + argv 分发 */
export function renderPlaceholderFunctionsTs(functionNames: string[]): string {
  const fnBodies = functionNames
    .map(
      (name) => `export async function ${name}() {
  // TODO: 请用 apply-patch 写入实际实现
  return { message: '${name} not implemented yet' }
}`,
    )
    .join('\n\n')

  const fnMap = functionNames.join(', ')

  return `import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '.env') })

${fnBodies}

// 入口：根据命令行参数调用对应函数
const functionName = process.argv[2]
const fn: Record<string, () => Promise<unknown>> = { ${fnMap} }
const handler = fn[functionName]
if (handler) {
  handler()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
} else {
  console.error(\`Unknown function: \${functionName}\`)
  process.exit(1)
}
`
}

/** 渲染 .env 文件（新版：直接接受 envVars 数组） */
export function renderDotEnvFromVars(
  envVars?: { key: string; placeholder: string; comment?: string }[],
): string {
  if (!envVars?.length) return ''
  return envVars
    .map((v) => {
      const comment = v.comment ? `# ${v.comment}\n` : ''
      return `${comment}${v.key}=${v.placeholder}`
    })
    .join('\n')
}

// ─── 旧工具：模板（向后兼容） ───

export function renderPackageJson(input: WidgetInput): string {
  const size = normalizeSize(input.size)
  const scripts: Record<string, string> = {}
  for (const fn of input.functions) {
    scripts[fn.name] = `npx tsx functions.ts ${fn.name}`
  }
  const pkg = {
    name: `dw-${input.widgetName}`,
    version: '1.0.0',
    description: input.widgetDescription,
    main: 'widget.tsx',
    scripts,
    openloaf: {
      type: 'widget',
      defaultSize: toDesktopWidgetSize(size.defaultW, size.defaultH),
      constraints: size,
      support: { workspace: true, project: true },
    },
  }
  return JSON.stringify(pkg, null, 2)
}

export function renderWidgetTsx(input: WidgetInput): string {
  const interval = input.refreshInterval ?? 60000
  const fnName = input.functions[0]?.name ?? 'getData'
  return `import type { WidgetProps } from '@openloaf/widget-sdk'
import { useWidgetData, useWidgetTheme } from '@openloaf/widget-sdk'

export default function Widget({ sdk }: WidgetProps) {
  const { data, loading, error } = useWidgetData(sdk, '${fnName}', {
    refreshInterval: ${interval},
  })
  const theme = useWidgetTheme(sdk)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-xs">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-destructive">
        <div className="text-xs">{error}</div>
      </div>
    )
  }

  return (
    ${input.uiCode}
  )
}
`
}

export function renderFunctionsTs(input: WidgetInput): string {
  const fnBodies = input.functions
    .map(
      (fn) => `export async function ${fn.name}() {
${fn.implementation
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
}`,
    )
    .join('\n\n')

  const fnMap = input.functions.map((fn) => fn.name).join(', ')

  return `import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
config({ path: resolve(__dirname, '.env') })

${fnBodies}

// 入口：根据命令行参数调用对应函数
const functionName = process.argv[2]
const fn: Record<string, () => Promise<unknown>> = { ${fnMap} }
const handler = fn[functionName]
if (handler) {
  handler()
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error(e.message)
      process.exit(1)
    })
} else {
  console.error(\`Unknown function: \${functionName}\`)
  process.exit(1)
}
`
}

export function renderDotEnv(input: WidgetInput): string {
  if (!input.envVars?.length) return ''
  return input.envVars
    .map((v) => {
      const comment = v.comment ? `# ${v.comment}\n` : ''
      return `${comment}${v.key}=${v.placeholder}`
    })
    .join('\n')
}
