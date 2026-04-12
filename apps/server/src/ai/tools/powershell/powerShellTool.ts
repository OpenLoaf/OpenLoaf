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
import { powerShellToolDef } from '@openloaf/api/types/tools/runtime'
import { expandPathTemplateVars, resolveToolWorkdir } from '@/ai/tools/toolScope'
import { buildExecEnv, formatFreeformOutput } from '@/ai/tools/execUtils'
import { resolveCommandSandboxDirs } from '@/ai/tools/commandSandbox'
import { backgroundProcessManager } from '@/ai/services/background/BackgroundProcessManager'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { createToolProgress } from '@/ai/tools/toolProgress'
import { getCachedPowerShellPath } from './powershellDetection'
import { buildPowerShellArgs } from './powershellProvider'
import { needsApprovalForPowerShell } from './powershellApproval'
import { buildPowerShellFailureHint } from './prompt'
import { interpretCommandResult } from './commandSemantics'
import { getDestructiveCommandWarning } from './destructiveWarning'
import { detectBlockedSleepPattern } from './sleepDetection'

/** 执行 PowerShell 命令工具（Windows 专用，对称于 Bash 工具）。 */
export const powerShellTool = tool({
  description: powerShellToolDef.description,
  inputSchema: zodSchema(powerShellToolDef.parameters),
  needsApproval: async ({ command }) => {
    // 先展开 ${CURRENT_CHAT_DIR} 等模板变量，再交给 AST 审批判定。
    // AI SDK 的 needsApproval 签名允许返回 PromiseLike<boolean>，PS 审批
    // 依赖 AST 解析器，必须异步。
    const expanded =
      typeof command === 'string' ? expandPathTemplateVars(command) : command
    return needsApprovalForPowerShell(expanded, {
      sandboxDirs: resolveCommandSandboxDirs(),
    })
  },
  execute: async (
    { command, description, timeout, run_in_background },
    { toolCallId },
  ): Promise<
    | string
    | {
        task_id: string
        pid: number
        status: 'running'
        background_info: string
        output_path: string
      }
  > => {
    const expandedCommand = expandPathTemplateVars(command)
    const { cwd } = resolveToolWorkdir({})

    // Sleep 检测：仅对前台模式启用。后台运行的 sleep 不会阻塞回合，
    // 无需拦截。第一条语句命中 `Start-Sleep N` / `sleep N`（N >= 2）时
    // 抛出错误，引导模型使用 run_in_background 或移除 sleep。
    if (run_in_background !== true) {
      const sleepError = detectBlockedSleepPattern(expandedCommand)
      if (sleepError) {
        throw new Error(sleepError)
      }
    }

    if (run_in_background === true) {
      const ctx = getRequestContext()
      const sessionId = ctx?.sessionId
      if (!sessionId) {
        throw new Error(
          'PowerShell(run_in_background) requires an active chat session.',
        )
      }
      const ownerAgentId = ctx?.agentStack?.[ctx.agentStack.length - 1]?.agentId
      // 后台执行：spawnShellProcess 内部已按平台自动选择 PowerShell.exe，
      // 因此 spawnPowerShell 复用 spawnBash 通道即可保持单一事实来源。
      const task = await backgroundProcessManager.spawnPowerShell({
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

    const binPath = await getCachedPowerShellPath()
    if (!binPath) {
      return [
        'Exit code: -1',
        'Wall time: 0 seconds',
        'Output:',
        'PowerShell is not available on this system. Install PowerShell 7+ (pwsh) from https://aka.ms/powershell or use the Bash tool on non-Windows platforms.',
      ].join('\n')
    }

    // 强制 UTF-8 输出，避免中文 Windows 默认 GBK 导致乱码。
    const utf8Prefix =
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; '
    const args = buildPowerShellArgs(utf8Prefix + expandedCommand)

    const progress = createToolProgress(toolCallId, 'PowerShell')

    const timeoutMs = Math.min(timeout ?? 120_000, 600_000)
    const startAt = Date.now()
    const outputChunks: string[] = []
    let timedOut = false

    progress.start(description ?? expandedCommand)

    const child = spawn(binPath, args, {
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
    child.stdout.on('data', chunk => {
      const text = String(chunk)
      outputChunks.push(text)
      progress.delta(text)
    })
    child.stderr.on('data', chunk => {
      const text = String(chunk)
      outputChunks.push(text)
      progress.delta(text)
    })

    const { code } = await new Promise<{ code: number | null }>(
      (resolve, reject) => {
        child.once('error', reject)
        child.once('exit', exitCode => {
          resolve({ code: exitCode })
        })
      },
    )

    clearTimeout(timer)

    const durationMs = Date.now() - startAt
    const durationSeconds = Math.round(durationMs / 100) / 10
    const aggregatedOutput = outputChunks.join('')

    const truncated = formatFreeformOutput(aggregatedOutput)
    const sections: string[] = []
    if (timedOut) {
      sections.push(
        `⚠ Command timed out after ${timeoutMs / 1000}s and was killed.`,
      )
      progress.error(`Timed out after ${timeoutMs / 1000}s`)
    } else if (code !== 0) {
      progress.done(`Exit ${code ?? -1} in ${durationSeconds}s`)
    } else {
      progress.done(`Done in ${durationSeconds}s`)
    }
    sections.push(
      `Exit code: ${code ?? -1}`,
      `Wall time: ${durationSeconds} seconds`,
    )
    if (truncated.totalLines !== truncated.truncatedLines) {
      sections.push(`Total output lines: ${truncated.totalLines}`)
    }
    sections.push('Output:', truncated.text)

    // 退出码语义解释：部分外部命令（robocopy、grep/rg/findstr）使用
    // 非零退出码表达非错误信息，附加 interpretation 避免误报为失败。
    if (!timedOut && code !== null) {
      const interpretation = interpretCommandResult(expandedCommand, code)
      if (interpretation) {
        sections.push(`Note: ${interpretation}`)
      }
    }

    // 破坏性命令告警（信息性，不影响审批）：让模型看到明确警示。
    const destructiveWarning = getDestructiveCommandWarning(expandedCommand)
    if (destructiveWarning) {
      sections.push(destructiveWarning)
    }

    // 命令失败时尝试从 stderr 中提取针对性纠正提示
    if (code !== 0 && !timedOut) {
      const hint = buildPowerShellFailureHint(aggregatedOutput)
      if (hint) {
        sections.push(hint)
      }
    }

    return sections.join('\n')
  },
})
