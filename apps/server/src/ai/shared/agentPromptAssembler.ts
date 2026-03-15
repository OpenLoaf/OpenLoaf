/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { resolveMemoryContent, resolveMemoryBlocks } from '@/ai/shared/memoryLoader'
import { getMasterPrompt } from '@/ai/agent-templates'

/** Input for assembling default agent instructions. */
type AssembleInstructionsInput = {
  /** Language for prompt selection. */
  lang?: string
}

/** Input for assembling memory section. */
type AssembleMemoryInput = {
  /** User home path (~/.openloaf/). */
  userHomePath?: string
  /** Project root path. */
  projectRootPath?: string
  /** Parent project root paths (top-level first). */
  parentProjectRootPaths?: string[]
}

/**
 * Assemble master agent instructions from template systemPrompt.
 * Used as the `instructions` parameter for createMasterAgent().
 */
export function assembleDefaultAgentInstructions(
  input?: AssembleInstructionsInput,
): string {
  return getMasterPrompt(input?.lang)
}

/**
 * Assemble memory blocks as independent <system-reminder> strings.
 * Each block is wrapped in its own <system-reminder> tag.
 * Returns an array of strings (empty array if no memory exists).
 */
export function assembleMemoryBlocks(
  input: AssembleMemoryInput,
): string[] {
  const blocks = resolveMemoryBlocks({
    userHomePath: input.userHomePath,
    projectRootPath: input.projectRootPath,
    parentProjectRootPaths: input.parentProjectRootPaths,
  })

  return blocks.map((block) => {
    const header = `# 记忆（${block.label}）\n来源: ${block.filePath}`
    return `<system-reminder>\n${header}\n\n${block.content}\n</system-reminder>`
  })
}
