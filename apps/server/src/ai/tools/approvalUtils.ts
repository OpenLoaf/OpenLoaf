/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** Sub-agent approval gate metadata. */
export type ApprovalGate = {
  approvalId: string
  toolCallId: string
  part: any
}

/** Resolve approval gate from sub-agent parts. */
export function resolveApprovalGate(parts: unknown[]): ApprovalGate | null {
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const approval = (part as { approval?: { id?: unknown; approved?: unknown } }).approval
    const approvalId = typeof approval?.id === 'string' ? approval.id : ''
    if (!approvalId) continue
    if (approval?.approved === true || approval?.approved === false) continue
    const toolCallId =
      typeof (part as { toolCallId?: unknown }).toolCallId === 'string'
        ? String((part as { toolCallId?: string }).toolCallId)
        : ''
    if (!toolCallId) continue
    return { approvalId, toolCallId, part }
  }
  return null
}

/** Update approval status on parts. */
export function applyApprovalDecision(input: {
  parts: unknown[]
  approvalId: string
  approved: boolean
}) {
  for (const part of input.parts) {
    if (!part || typeof part !== 'object') continue
    const approval = (part as { approval?: { id?: unknown } }).approval
    const currentId = typeof approval?.id === 'string' ? approval.id : ''
    if (currentId !== input.approvalId) continue
    ;(part as any).approval = { ...approval, approved: input.approved }
    ;(part as any).state = 'approval-responded'
  }
}
