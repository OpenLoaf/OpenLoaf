import { resolveDefaultAgentPromptParts } from '@/ai/shared/defaultAgentResolver'
import { resolveMemoryContent } from '@/ai/shared/memoryLoader'

/** Input for assembling default agent instructions. */
type AssembleInstructionsInput = {
  /** Workspace root path. */
  workspaceRootPath?: string
  /** Project root path. */
  projectRootPath?: string
}

/** Input for assembling memory section. */
type AssembleMemoryInput = {
  /** Workspace root path. */
  workspaceRootPath?: string
  /** Project root path. */
  projectRootPath?: string
  /** Parent project root paths (top-level first). */
  parentProjectRootPaths?: string[]
}

/**
 * Assemble IDENTITY + SOUL + AGENT into a single instructions string.
 * Used as the `instructions` parameter for createMasterAgent().
 */
export function assembleDefaultAgentInstructions(
  input: AssembleInstructionsInput,
): string {
  const parts = resolveDefaultAgentPromptParts(
    input.workspaceRootPath,
    input.projectRootPath,
  )
  // 逻辑：按 IDENTITY → SOUL → AGENT 顺序组装，用空行分隔。
  return [parts.identity, parts.soul, parts.agent]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Assemble memory section for injection into session preface.
 * Returns empty string if no memory files exist.
 */
export function assembleMemorySection(
  input: AssembleMemoryInput,
): string {
  const content = resolveMemoryContent({
    workspaceRootPath: input.workspaceRootPath,
    projectRootPath: input.projectRootPath,
    parentProjectRootPaths: input.parentProjectRootPaths,
  })
  if (!content) return ''
  return `# Memory\n${content}`
}
