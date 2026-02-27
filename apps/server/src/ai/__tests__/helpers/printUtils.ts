/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * 调试输出格式化工具。
 */

const DIVIDER = '─'.repeat(60)

export function printSection(title: string) {
  console.log(`\n${DIVIDER}`)
  console.log(`  ${title}`)
  console.log(DIVIDER)
}

export function printModelInfo(info: {
  provider: string
  modelId: string
  chatModelId: string
  tags?: string[]
}) {
  console.log(`  provider:     ${info.provider}`)
  console.log(`  modelId:      ${info.modelId}`)
  console.log(`  chatModelId:  ${info.chatModelId}`)
  if (info.tags?.length) {
    console.log(`  tags:         ${info.tags.join(', ')}`)
  }
}

export function printResponse(text: string) {
  console.log(`\n  Response:\n  ${text.slice(0, 500)}`)
  if (text.length > 500) console.log(`  ... (${text.length} chars total)`)
}

type TokenUsageLike = {
  promptTokens?: number
  completionTokens?: number
  inputTokens?: number
  outputTokens?: number
}

export function printTokenUsage(usage: TokenUsageLike | undefined) {
  const prompt = usage?.promptTokens ?? usage?.inputTokens
  const completion = usage?.completionTokens ?? usage?.outputTokens
  console.log(
    `  tokens: prompt=${prompt ?? '?'}, completion=${completion ?? '?'}`,
  )
}

export function printDuration(startMs: number) {
  const ms = Date.now() - startMs
  console.log(`  duration: ${ms}ms`)
}

export function printPass(name: string) {
  console.log(`\n  PASS  ${name}`)
}

export function printFail(name: string, err: unknown) {
  console.error(`\n  FAIL  ${name}`)
  console.error(`  ${err instanceof Error ? err.message : err}`)
}
