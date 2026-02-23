import { parseExpression } from '@babel/parser'

type JsxLocation = {
  line: number
  column: number
}

type JsxValidationIssue = {
  message: string
  loc?: JsxLocation
}

/** Format a Babel location into human readable text. */
function formatLoc(loc?: JsxLocation): string {
  if (!loc) return ''
  if (!Number.isFinite(loc.line) || !Number.isFinite(loc.column)) return ''
  const col = loc.column + 1
  return `(${loc.line}:${col})`
}

/** Create an issue with optional location. */
function createIssue(message: string, loc?: JsxLocation): JsxValidationIssue {
  return { message, loc }
}

/** Find the first disallowed JSX pattern. */
function findFirstIssue(root: unknown): JsxValidationIssue | null {
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) continue
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child)
      continue
    }
    if (typeof node !== 'object') continue
    const record = node as { type?: string; loc?: JsxLocation; [key: string]: unknown }

    switch (record.type) {
      case 'JSXSpreadAttribute':
        // 逻辑：禁止 {...props} 形式的属性展开。
        return createIssue('不支持 `{...}` 属性展开。', record.loc)
      case 'JSXSpreadChild':
        // 逻辑：禁止 {...children} 形式的子节点展开。
        return createIssue('不支持 `{...}` 子节点展开。', record.loc)
      default:
        break
    }

    for (const value of Object.values(record)) {
      if (!value) continue
      if (typeof value === 'object') stack.push(value)
    }
  }
  return null
}

/** Validate JSX input for jsx-create tool. */
export function validateJsxCreateInput(input: string): void {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('JSX 内容为空。')
  }

  let ast: unknown
  try {
    ast = parseExpression(trimmed, { plugins: ['jsx'] })
  } catch (error) {
    const loc = (error as { loc?: JsxLocation }).loc
    const message = error instanceof Error ? error.message : String(error)
    const suffix = formatLoc(loc)
    throw new Error(`JSX 解析失败${suffix ? ` ${suffix}` : ''}：${message}`)
  }

  const root = ast as { type?: string }
  if (root.type !== 'JSXElement' && root.type !== 'JSXFragment') {
    // 逻辑：只允许单个 JSX 根节点。
    throw new Error('仅支持单个 JSX 根节点。')
  }

  const issue = findFirstIssue(ast)
  if (issue) {
    const suffix = formatLoc(issue.loc)
    throw new Error(`${issue.message}${suffix ? ` ${suffix}` : ''}`)
  }
}
