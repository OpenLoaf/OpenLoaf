/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
// @ts-expect-error -- shell-quote has no bundled types
import { parse as shellParse } from 'shell-quote'

// ─── shell-quote 内联类型 ─────────────────────────────────────────────────────

type ShellToken = string | { op: string } | { pattern: string } | { comment: string }

// ─── 安全命令白名单 ─────────────────────────────────────────────────────────

const SAFE_COMMANDS_UNIX = new Set([
  // 文件系统查看
  'ls', 'll', 'which', 'pwd', 'whoami', 'uname', 'date', 'find', 'stat',
  'du', 'df', 'file', 'tree', 'realpath', 'readlink', 'basename', 'dirname',
  // 文本搜索与处理
  'grep', 'rg', 'ag', 'cat', 'head', 'tail', 'wc', 'sort', 'uniq',
  'awk', 'sed', 'xargs', 'cut', 'tr', 'jq', 'yq', 'column', 'diff',
  'comm', 'tee', 'less', 'more', 'strings', 'hexdump', 'xxd',
  // 系统信息
  'ps', 'id', 'groups', 'who', 'w', 'uptime', 'hostname', 'env', 'printenv',
  'top', 'htop', 'vmstat', 'iostat', 'dmesg', 'last', 'finger',
  'lsblk', 'lscpu', 'free', 'vm_stat', 'sw_vers', 'system_profiler',
  // 网络（只读）
  'ping', 'traceroute', 'nslookup', 'dig', 'host', 'curl', 'wget',
  'whois', 'ifconfig', 'netstat', 'ss',
  // 归档压缩
  'unzip', 'zip', 'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2',
  'xz', 'unxz', 'zstd', 'unrar', '7z', '7za',
  // 文件创建（非破坏性）
  'mkdir', 'touch', 'cp', 'ln', 'install',
  // 校验与编码
  'md5', 'md5sum', 'shasum', 'sha256sum', 'base64',
  // macOS 预览
  'open', 'pbcopy', 'pbpaste',
  // 版本控制
  'git', 'svn',
  // 运行时 & 解释器
  'python', 'python3', 'node', 'bun', 'deno', 'ruby', 'perl', 'php',
  'java', 'javac', 'go', 'rustc', 'cargo', 'swift', 'swiftc', 'dotnet',
  // 包管理器
  'pip', 'pip3', 'uv', 'npm', 'npx', 'pnpm', 'yarn', 'brew',
  'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'conda', 'poetry', 'pdm', 'pipx',
  // 构建工具
  'make', 'cmake', 'ninja', 'gradle', 'mvn', 'ant',
  // Playwright（浏览器自动化，开发工具）
  'playwright',
  // Shell 流控关键字（被 shell-quote 按分号拆分后会成为命令段首 token）
  // 循环/条件起始：for, while, until, if, case, select
  // 独立闭合：done, fi, esac（段内只有自身，无后续命令）
  // 注意：do/then/else/elif 不在此白名单——它们后面紧跟真正命令，
  // 由 BLOCK_INTRO_KEYWORDS 处理（见 allCommandsSafe）。
  'for', 'while', 'until', 'if', 'case', 'select', 'in',
  'done', 'fi', 'esac',
  // 其他安全命令
  'echo', 'printf', 'expr', 'bc', 'man', 'help', 'info', 'type',
  'nproc', 'seq', 'yes', 'true', 'false', 'sleep', 'time', 'timeout',
])

const SAFE_COMMANDS_WIN = new Set([
  'ls', 'dir', 'gci', 'get-childitem', 'where', 'get-command',
  'pwd', 'whoami', 'hostname', 'find', 'findstr', 'select-string', 'tree', 'type',
  'systeminfo', 'ipconfig', 'get-computerinfo', 'get-ciminstance',
  'ping', 'tracert', 'nslookup', 'curl', 'wget',
  'expand-archive', 'compress-archive', 'tar', 'mkdir', 'new-item',
  'copy-item', 'copy', 'cp',
  'python', 'python3', 'node', 'npm', 'npx', 'pnpm', 'yarn',
  'pip', 'pip3', 'git', 'dotnet', 'cargo', 'go',
  'echo', 'write-output', 'get-content', 'cat', 'sort', 'measure-object',
])

const SHELL_BINARIES = new Set(['sh', 'bash', 'zsh', 'fish', 'powershell', 'pwsh', 'cmd'])

/**
 * 沙箱限定安全命令：这些命令在沙箱目录内操作时免审批。
 * 它们对用户源码/系统文件有破坏性，但在会话私有目录（CURRENT_CHAT_DIR 等）内是安全的。
 */
const SANDBOX_ONLY_COMMANDS = new Set(['rm', 'mv', 'rmdir'])

// ─── 命令组合操作符（用于拆分独立命令段） ─────────────────────────────────────

/** 这些操作符仅组合命令，本身不引入副作用 */
const COMMAND_SEPARATORS = new Set([';', '&&', '||', '|', ';;', '|&'])

/** 重定向操作符 */
const REDIRECT_OPS = new Set(['>', '>>', '<', '<<', '>&', '<&', '<>'])

/** 危险操作符：后台执行、子 shell */
const DANGEROUS_OPS = new Set(['&', '(', ')'])

// ─── 测试专用审批触发标记 ──────────────────────────────────────────────────
// 任何含这个字符串的 Bash 命令都会强制走审批流程。仅用于浏览器测试验证
// reject-all / approve-all 审批链路（见 tool-approval.browser.tsx）。
// 产品用户极不可能输入这个怪字符串；测试里调 Bash `openloaf-test-approval`
// 会触发审批 UI 并命中 reject/approve 策略，但命令本身不是合法 shell 可执行，
// reject 路径直接中断、approve 路径执行时 shell 报 "command not found"（无害）。
export const TEST_APPROVAL_COMMAND = 'openloaf-test-approval'

// ─── 核心逻辑 ───────────────────────────────────────────────────────────────

/** 标准化 token 为命令名（basename、小写、去 .exe/.cmd 后缀） */
function normalizeToken(token: string): string {
  if (!token) return ''
  const cleaned = token.replace(/^['"]|['"]$/g, '')
  return path.basename(cleaned).toLowerCase().replace(/\.(exe|cmd)$/i, '')
}

/** 判断单个命令 token 是否安全。 */
function isSafeCommand(token: string): boolean {
  if (!token) return false
  if (token === 'sudo') return false
  if (SHELL_BINARIES.has(token)) return false
  const allowlist = process.platform === 'win32' ? SAFE_COMMANDS_WIN : SAFE_COMMANDS_UNIX
  return allowlist.has(token)
}

/**
 * 检测 $'...' ANSI-C 引号。shell-quote 不识别此语法，
 * 而 ANSI-C 引号内可编码任意字节（包括 ;、`、$() 等），
 * 保守处理：存在即需审批。
 */
function hasAnsiCQuote(command: string): boolean {
  return /\$'(?:[^'\\]|\\.)*'/.test(command)
}

/**
 * 检测 string token 中是否包含反引号（命令替换）。
 * shell-quote 不会将反引号解析为操作符，而是保留在字符串中。
 */
function hasBacktick(token: string): boolean {
  return token.includes('`')
}

/** token 是否是操作符 */
function isOp(token: ShellToken): token is { op: string } {
  return typeof token === 'object' && 'op' in token
}

// ─── Token 分析 ──────────────────────────────────────────────────────────────

interface AnalysisResult {
  /** 按分隔符拆分的命令组，每组为 string token 数组 */
  commands: string[][]
  /** 是否包含危险操作符（后台 &、子 shell ()、命令替换 $()、反引号） */
  hasDangerousOps: boolean
  /** 是否包含重定向操作符 */
  hasRedirection: boolean
}

/**
 * 对 shell-quote 解析结果进行单遍分析：
 * - 按命令分隔符拆分为独立命令段
 * - 检测危险操作符和重定向
 */
function analyzeTokens(tokens: ShellToken[]): AnalysisResult {
  const commands: string[][] = []
  let current: string[] = []
  let hasDangerousOps = false
  let hasRedirection = false

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as ShellToken

    if (isOp(token)) {
      const op = token.op

      if (COMMAND_SEPARATORS.has(op)) {
        // 命令分隔符：结束当前命令段，开始新段
        if (current.length > 0) {
          commands.push(current)
          current = []
        }
      } else if (REDIRECT_OPS.has(op)) {
        hasRedirection = true
        // 跳过重定向目标 token（下一个 token）
        i++
      } else if (DANGEROUS_OPS.has(op)) {
        hasDangerousOps = true
      }
    } else if (typeof token === 'string') {
      // 检测命令替换：'$' 后紧跟 '(' 操作符
      if (token === '$' && i + 1 < tokens.length) {
        const next = tokens[i + 1]!
        if (isOp(next) && next.op === '(') {
          hasDangerousOps = true
        }
      }

      // 检测反引号
      if (hasBacktick(token)) {
        hasDangerousOps = true
      }

      current.push(token)
    }
    // { pattern: ... } 和 { comment: ... } 视为惰性 token，忽略
  }

  // 收尾最后一段
  if (current.length > 0) {
    commands.push(current)
  }

  return { commands, hasDangerousOps, hasRedirection }
}

/**
 * 块引导关键字：do/then/else/elif 后面紧跟真正的命令。
 * shell-quote 不会将它们拆成独立段，而是作为同一段的前缀。
 * 例如 `for i in *; do rm -rf /; done` 的第二段是 ["do", "rm", "-rf", "/"]，
 * 需要跳过 do 检查 rm。
 */
const BLOCK_INTRO_KEYWORDS = new Set(['do', 'then', 'else', 'elif'])

/**
 * 检查所有命令段的首个 token 是否在安全名单中。
 * mode='strict' 只查全局白名单；mode='sandbox' 额外允许沙箱限定命令。
 */
function allCommandsSafe(commands: string[][], mode: 'strict' | 'sandbox'): boolean {
  for (const cmd of commands) {
    if (cmd.length === 0) continue
    // 跳过块引导关键字前缀，检查实际命令
    let idx = 0
    while (idx < cmd.length && BLOCK_INTRO_KEYWORDS.has(normalizeToken(cmd[idx]!))) {
      idx++
    }
    if (idx >= cmd.length) continue // 段内只有关键字（极端边界，视为安全）
    const token = normalizeToken(cmd[idx]!)
    if (isSafeCommand(token)) continue
    if (mode === 'sandbox' && SANDBOX_ONLY_COMMANDS.has(token)) continue
    return false
  }
  return true
}

// ─── 沙箱目录检测 ──────────────────────────────────────────────────────────

/** 判断 target 路径是否在 root 下（或等于 root）。 */
function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * 提取命令字符串中所有"看起来是绝对路径"的 token。
 * 支持：/abs/path、~/rel、C:\foo\bar 等。
 * 只在空白/分隔符之后出现的才算，避免误匹配 URL 中的 //。
 */
function extractAbsolutePaths(command: string): string[] {
  const found: string[] = []
  const pattern =
    /(?:^|[\s"'=:,;|&<>()`])(~\/[^\s"'`;|&<>()]*|\/[^\s"'`;|&<>():]*|[a-zA-Z]:\\[^\s"'`;|&<>()]*)/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(command)) !== null) {
    const p = m[1]
    if (p && p.length > 1) found.push(p)
  }
  return found
}

/** 系统二进制路径前缀（工具调用时硬引用，不算用户文件）。 */
const SYSTEM_PATH_PREFIXES = [
  '/bin/', '/sbin/', '/usr/', '/opt/', '/etc/',
  '/dev/null', '/dev/stdin', '/dev/stdout', '/dev/stderr',
  '/tmp/', '/System/', '/Library/', '/var/',
]

function isSystemPath(absPath: string): boolean {
  return SYSTEM_PATH_PREFIXES.some(
    (prefix) => absPath === prefix.replace(/\/$/, '') || absPath.startsWith(prefix),
  )
}

/**
 * 命令中出现的所有绝对/home 路径是否都落在 sandboxDirs 集合内。
 * 系统路径（/bin、/usr 等）不影响判断；若命令里没有出现任何绝对路径，
 * 返回 false（让调用方走常规判定，不特权化纯相对路径命令）。
 */
function commandStaysInSandbox(command: string, sandboxDirs: string[]): boolean {
  if (sandboxDirs.length === 0) return false
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const resolvedSandboxes = sandboxDirs.map((d) => path.resolve(d))
  const found = extractAbsolutePaths(command)
  if (found.length === 0) return false
  for (const raw of found) {
    const expanded = raw.startsWith('~') ? raw.replace(/^~/, home) : raw
    const abs = path.resolve(expanded)
    if (isSystemPath(abs)) continue
    const insideAny = resolvedSandboxes.some((sb) => isPathInside(sb, abs))
    if (!insideAny) return false
  }
  return true
}

// ─── 导出 ───────────────────────────────────────────────────────────────────

export interface ApprovalOptions {
  /**
   * 沙箱目录白名单（绝对路径）。若命令里所有用户路径都落在这些目录内，
   * 即使命令含有重定向、分号等"危险"操作符，也无需审批。典型值：
   * CURRENT_CHAT_DIR / CURRENT_BOARD_DIR 对应的绝对路径。
   */
  sandboxDirs?: string[]
}

/** 判断 shell 命令是否需要用户审批。false = 安全，true = 需要审批。 */
export function needsApprovalForCommand(
  command: string | string[] | undefined,
  options?: ApprovalOptions,
): boolean {
  // 数组形式：只看第一个 token
  if (Array.isArray(command)) {
    return !isSafeCommand(normalizeToken(command[0] ?? ''))
  }

  const trimmed = command?.trim() ?? ''
  if (!trimmed) return true

  // 测试审批触发：含 TEST_APPROVAL_COMMAND 强制审批（给 browser test 用）
  if (trimmed.includes(TEST_APPROVAL_COMMAND)) return true

  // ANSI-C 引号预检：$'...' 内可编码任意字节，保守拦截
  if (hasAnsiCQuote(trimmed)) return true

  // 多行命令：shell-quote 将 \n 视为空白，需逐行检查
  if (trimmed.includes('\n')) {
    const lines = trimmed
      .split('\n')
      .filter((l) => l.trim())
      // 跳过注释行（# 开头）和 shebang（#!/...）：它们不是可执行命令
      .filter((l) => !l.trimStart().startsWith('#'))
    if (lines.length === 0) return false // 全是注释/空行 → 安全
    return lines.some((line) => needsApprovalForCommand(line, options))
  }

  // 使用 shell-quote 解析
  const tokens: ShellToken[] = shellParse(trimmed)
  const { commands, hasDangerousOps, hasRedirection } = analyzeTokens(tokens)

  // 无命令段（空解析）→ 需审批
  if (commands.length === 0) return true

  // 危险操作符（后台 &、子 shell、命令替换、反引号）
  if (hasDangerousOps) {
    return !canSandboxExempt(commands, trimmed, options)
  }

  // 非白名单命令
  if (!allCommandsSafe(commands, 'strict')) {
    return !canSandboxExempt(commands, trimmed, options)
  }

  // 重定向
  if (hasRedirection) {
    if (
      options?.sandboxDirs?.length &&
      commandStaysInSandbox(trimmed, options.sandboxDirs)
    ) {
      return false
    }
    return true
  }

  // 所有命令在白名单，无危险操作符，无重定向 → 安全
  return false
}

/** 沙箱豁免：命令段全在（白名单 ∪ 沙箱命令）且路径全在沙箱内 */
function canSandboxExempt(
  commands: string[][],
  rawCommand: string,
  options?: ApprovalOptions,
): boolean {
  return !!(
    options?.sandboxDirs?.length &&
    allCommandsSafe(commands, 'sandbox') &&
    commandStaysInSandbox(rawCommand, options.sandboxDirs)
  )
}
