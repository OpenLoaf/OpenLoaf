/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn } from 'node:child_process'
import { tool, zodSchema } from 'ai'
import { bashToolDef } from '@openloaf/api/types/tools/runtime'
import { expandPathTemplateVars, resolveToolWorkdir } from '@/ai/tools/toolScope'
import { buildExecEnv, formatFreeformOutput } from '@/ai/tools/execUtils'
import { needsApprovalForCommand } from '@/ai/tools/commandApproval'
import { resolveCommandSandboxDirs } from '@/ai/tools/commandSandbox'
import { backgroundProcessManager } from '@/ai/services/background/BackgroundProcessManager'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { createToolProgress } from '@/ai/tools/toolProgress'

/** 检测命令中可能存在的未加引号的中文路径。 */
function detectUnquotedCjkPaths(command: string): string | null {
  // 遮蔽已引号包裹的字符串，避免误报
  const masked = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")
  // 检测 CJK 字符附近的未引号空格
  if (/[\u4e00-\u9fff][^\s"']*\s+[^\-|>]/.test(masked)) {
    return '[HINT] 命令中可能包含未加引号的中文路径。请用双引号包裹含空格或中文的文件路径。'
  }
  return null
}

/** 构建 shell 命令参数。 */
function buildShellCommand(command: string): { file: string; args: string[] } {
  const trimmed = command.trim()
  if (!trimmed) throw new Error('command is required.')
  if (process.platform === 'win32') {
    // 强制 PowerShell 输出 UTF-8，避免中文 Windows 默认 GBK 编码导致乱码。
    const utf8Prefix = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; '
    return { file: 'powershell.exe', args: ['-Command', utf8Prefix + trimmed] }
  }
  const resolvedShell = process.env.SHELL || '/bin/sh'
  return { file: resolvedShell, args: ['-lc', trimmed] }
}

/** 执行 Bash 命令工具。 */
export const bashTool = tool({
  description: bashToolDef.description,
  inputSchema: zodSchema(bashToolDef.parameters),
  needsApproval: ({ command }) => {
    // 先展开 ${CURRENT_CHAT_DIR} 等模板变量，再判定：展开后路径是否落在
    // 当前会话沙箱内决定了是否需要审批。
    const expanded = typeof command === 'string' ? expandPathTemplateVars(command) : command
    return needsApprovalForCommand(expanded, {
      sandboxDirs: resolveCommandSandboxDirs(),
    })
  },
  execute: async ({
    command,
    description,
    timeout,
    run_in_background,
  }, { toolCallId }): Promise<string | {
    task_id: string
    pid: number
    status: 'running'
    background_info: string
    output_path: string
  }> => {
    const expandedCommand = expandPathTemplateVars(command)
    const { cwd } = resolveToolWorkdir({})

    if (run_in_background === true) {
      const ctx = getRequestContext()
      const sessionId = ctx?.sessionId
      if (!sessionId) {
        throw new Error('Bash(run_in_background) requires an active chat session.')
      }
      const ownerAgentId = ctx?.agentStack?.[ctx.agentStack.length - 1]?.agentId
      const task = await backgroundProcessManager.spawnBash({
        sessionId,
        command: expandedCommand,
        description: description ?? expandedCommand,
        ownerAgentId,
        env: buildExecEnv({}),
        cwd,
      })
      return {
        task_id: task.id,
        pid: task.pid,
        status: 'running',
        output_path: task.outputPath,
        background_info: `Command backgrounded as task ${task.id} (pid ${task.pid}). Output log: ${task.outputPath}. Use Read to check output, Kill(task_id) to stop.`,
      }
    }

    const { file, args } = buildShellCommand(expandedCommand)
    const progress = createToolProgress(toolCallId, 'Bash')

    const timeoutMs = Math.min(timeout ?? 120_000, 600_000)
    const startAt = Date.now()
    const outputChunks: string[] = []
    let timedOut = false

    progress.start(description ?? expandedCommand)

    const child = spawn(file, args, {
      cwd,
      env: buildExecEnv({}),
      stdio: 'pipe',
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      // 给进程 3s 优雅退出，否则强杀
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL')
      }, 3000)
    }, timeoutMs)

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')
    child.stdout.on('data', (chunk) => {
      const text = String(chunk)
      outputChunks.push(text)
      progress.delta(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      outputChunks.push(text)
      progress.delta(text)
    })

    const { code } = await new Promise<{ code: number | null }>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (exitCode) => {
        resolve({ code: exitCode })
      })
    })

    clearTimeout(timer)

    const durationMs = Date.now() - startAt
    const durationSeconds = Math.round(durationMs / 100) / 10
    const aggregatedOutput = outputChunks.join('')

    const truncated = formatFreeformOutput(aggregatedOutput)
    const sections: string[] = []
    if (timedOut) {
      sections.push(`⚠ Command timed out after ${timeoutMs / 1000}s and was killed.`)
      progress.error(`Timed out after ${timeoutMs / 1000}s`)
    } else if (code !== 0) {
      progress.done(`Exit ${code ?? -1} in ${durationSeconds}s`)
    } else {
      progress.done(`Done in ${durationSeconds}s`)
    }
    sections.push(`Exit code: ${code ?? -1}`, `Wall time: ${durationSeconds} seconds`)
    if (truncated.totalLines !== truncated.truncatedLines) {
      sections.push(`Total output lines: ${truncated.totalLines}`)
    }
    sections.push('Output:', truncated.text)

    // 命令失败时检测可能的中文路径问题
    if (code !== 0) {
      const unquotedWarning = detectUnquotedCjkPaths(expandedCommand)
      if (unquotedWarning) {
        sections.push(unquotedWarning)
      }
    }

    return sections.join('\n')
  },
})
