/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { resolveMemoryBlocks } from '@/ai/shared/memoryLoader'
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
 * Assemble memory blocks as independent <system-tag type="*-memory"> strings.
 * Each block embeds the scope's MEMORY.md (the index), wrapped in a scope-specific
 * system-tag. The model reads individual memory files on demand via Read against
 * ${USER_MEMORY_DIR} / ${PROJECT_MEMORY_DIR}.
 */
export function assembleMemoryBlocks(
  input: AssembleMemoryInput,
): string[] {
  const blocks = resolveMemoryBlocks({
    userHomePath: input.userHomePath,
    projectRootPath: input.projectRootPath,
    parentProjectRootPaths: input.parentProjectRootPaths,
  })

  const scopeMeta: Record<
    string,
    { type: string; desc: string; pathVar: string }
  > = {
    user: {
      type: 'user-memory',
      desc: '用户全局记忆索引',
      pathVar: '${USER_MEMORY_DIR}',
    },
    'parent-project': {
      type: 'parent-project-memory',
      desc: '父项目记忆索引',
      pathVar: '${PROJECT_MEMORY_DIR}',
    },
    project: {
      type: 'project-memory',
      desc: '当前项目记忆索引',
      pathVar: '${PROJECT_MEMORY_DIR}',
    },
    agent: {
      type: 'agent-memory',
      desc: 'Agent 专属记忆索引',
      pathVar: '${USER_MEMORY_DIR}/agents/<name>',
    },
  }

  return blocks.map((block) => {
    const meta = scopeMeta[block.scope] ?? {
      type: 'memory',
      desc: block.label,
      pathVar: '',
    }
    const hint =
      `这是 MEMORY.md 索引。每行 \`- [key](file.md) — summary\` 指向 ${meta.pathVar}/ 下的具体文件；` +
      `需要完整内容时 \`Read ${meta.pathVar}/<file.md>\`。写入/更新/删除用 MemorySave。`
    return `<system-tag type="${meta.type}" desc="${meta.desc}">\n${hint}\n\n${block.content}\n</system-tag>`
  })
}
