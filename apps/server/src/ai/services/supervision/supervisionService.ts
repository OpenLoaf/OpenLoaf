/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateText } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { needsApprovalForCommand } from '@/ai/tools/commandApproval'
import { registerFrontendToolPending, resolveFrontendToolPending } from '@/ai/tools/pendingRegistry'
import { taskEventBus } from '@/services/taskEventBus'

export type SupervisionDecision = {
  decision: 'approve' | 'reject' | 'escalate'
  reason: string
}

export type SupervisionRequest = {
  toolName: string
  toolArgs: Record<string, unknown>
  taskId: string
  taskName: string
  taskDescription?: string
  recentContext?: string
}

/**
 * Three-tier supervision service for autonomous task execution.
 *
 * Tier 1: Fast rule-based (commandApproval white/blacklist)
 * Tier 2: Supervisor LLM auto-decision
 * Tier 3: Human approval (via pendingRegistry)
 */
export class SupervisionService {
  private model: LanguageModelV3 | null = null

  setModel(model: LanguageModelV3) {
    this.model = model
  }

  /**
   * Evaluate whether a tool call should be approved.
   * Returns the decision (approve/reject) or escalates to human.
   */
  async evaluate(request: SupervisionRequest): Promise<SupervisionDecision> {
    // Tier 1: Fast rule-based check
    const tier1Result = this.tier1RuleCheck(request)
    if (tier1Result) return tier1Result

    // Tier 2: Supervisor LLM decision
    if (this.model) {
      const tier2Result = await this.tier2LLMDecision(request)
      if (tier2Result.decision !== 'escalate') return tier2Result
    }

    // Tier 3: Escalate to human
    return this.tier3HumanApproval(request)
  }

  /**
   * Tier 1: Fast rule-based check using commandApproval whitelist.
   * Returns null if the tool needs further evaluation.
   */
  private tier1RuleCheck(request: SupervisionRequest): SupervisionDecision | null {
    const { toolName, toolArgs } = request

    // Read-only tools are always safe
    const readOnlyTools = new Set([
      'read-file', 'list-dir', 'grep-files', 'time-now',
      'browser-snapshot', 'browser-observe', 'browser-extract',
      'project-query', 'calendar-query', 'email-query',
      'wait-agent', 'task-status',
    ])
    if (readOnlyTools.has(toolName)) {
      return { decision: 'approve', reason: '只读工具，自动放行' }
    }

    // Shell commands: check whitelist
    if (toolName === 'shell' || toolName === 'shell-command') {
      const command = toolArgs.command as string | string[] | undefined
      if (!needsApprovalForCommand(command)) {
        return { decision: 'approve', reason: '只读 shell 命令，自动放行' }
      }
    }

    if (toolName === 'exec-command') {
      const cmd = toolArgs.cmd as string | string[] | undefined
      if (!needsApprovalForCommand(cmd)) {
        return { decision: 'approve', reason: '只读 exec 命令，自动放行' }
      }
    }

    // Agent tools: generally safe within depth limits
    if (toolName === 'spawn-agent' || toolName === 'send-input' || toolName === 'abort-agent') {
      return { decision: 'approve', reason: 'Agent 协作工具，自动放行' }
    }

    // Plan and file tools are generally safe in task context
    if (toolName === 'update-plan') {
      return { decision: 'approve', reason: '计划更新工具，自动放行' }
    }

    return null // Needs further evaluation
  }

  /**
   * Tier 2: Use a fast LLM to evaluate the tool call.
   */
  private async tier2LLMDecision(request: SupervisionRequest): Promise<SupervisionDecision> {
    try {
      const prompt = this.buildSupervisionPrompt(request)
      const { text } = await generateText({
        model: this.model!,
        prompt,
        maxTokens: 200,
      })

      return this.parseDecision(text)
    } catch (error) {
      // On LLM failure, escalate to human
      return {
        decision: 'escalate',
        reason: `监管 Agent 判断失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  /**
   * Tier 3: Escalate to human via pendingRegistry.
   */
  private async tier3HumanApproval(request: SupervisionRequest): Promise<SupervisionDecision> {
    const toolCallId = `supervision-${request.taskId}-${Date.now()}`

    // Notify frontend
    taskEventBus.emitStatusChange({
      taskId: request.taskId,
      status: 'review',
      previousStatus: 'running',
      reviewType: 'plan',
      title: `工具审批: ${request.toolName}`,
      updatedAt: new Date().toISOString(),
    })

    try {
      const result = await registerFrontendToolPending({
        toolCallId,
        timeoutSec: 300, // 5 minutes
      })

      if (result.approved) {
        return { decision: 'approve', reason: '用户已批准' }
      }
      return {
        decision: 'reject',
        reason: result.payload?.reason as string ?? '用户已拒绝',
      }
    } catch {
      // Timeout → auto-approve for non-destructive, reject for destructive
      return {
        decision: 'reject',
        reason: '人类审批超时，默认拒绝',
      }
    }
  }

  private buildSupervisionPrompt(request: SupervisionRequest): string {
    return `你是一个安全监管 Agent。你的任务是判断一个 AI Agent 的工具调用是否应该被批准。

## 当前任务上下文
任务名称: ${request.taskName}
任务描述: ${request.taskDescription ?? '无'}

## 待审批工具调用
工具名称: ${request.toolName}
工具参数: ${JSON.stringify(request.toolArgs, null, 2)}

## 最近上下文
${request.recentContext ?? '无'}

## 判断规则
1. 如果工具调用与任务目标相关且安全，回复 APPROVE
2. 如果工具调用明显不安全或与任务无关（例如删除系统文件、访问敏感数据），回复 REJECT 并说明理由
3. 如果你无法确定，回复 ESCALATE

请以 JSON 格式回复: {"decision": "approve|reject|escalate", "reason": "理由"}
仅回复 JSON，不要其他内容。`
  }

  private parseDecision(text: string): SupervisionDecision {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { decision?: string; reason?: string }
        const decision = parsed.decision?.toLowerCase()
        if (decision === 'approve' || decision === 'reject' || decision === 'escalate') {
          return { decision, reason: parsed.reason ?? '' }
        }
      }
    } catch {
      // Parse failure
    }
    // Default to escalate if parsing fails
    return { decision: 'escalate', reason: '无法解析监管 Agent 决策' }
  }
}

export const supervisionService = new SupervisionService()
