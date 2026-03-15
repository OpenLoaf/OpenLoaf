/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { AgentFrame } from '@/ai/shared/context/requestContext'
import {
  createMasterAgent,
  createMasterAgentFrame,
  createPMAgent,
  createPMAgentFrame,
  type MasterAgentModelInfo,
} from '@/ai/services/agentFactory'

type MasterAgentRunnerInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3
  /** Model metadata for the agent frame. */
  modelInfo: MasterAgentModelInfo
  /** Optional instructions override. */
  instructions?: string
}

export type MasterAgentRunner = {
  /** ToolLoopAgent instance. */
  agent: ReturnType<typeof createMasterAgent>
  /** Frame metadata for the agent. */
  frame: AgentFrame
}

/**
 * Creates a master agent runner for the current request (MVP).
 */
export function createMasterAgentRunner(input: MasterAgentRunnerInput): MasterAgentRunner {
  return {
    agent: createMasterAgent({
      model: input.model,
      instructions: input.instructions,
    }),
    frame: createMasterAgentFrame({ model: input.modelInfo }),
  }
}

type PMAgentRunnerInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3
  /** Model metadata for the agent frame. */
  modelInfo: MasterAgentModelInfo
  /** Optional instructions override. */
  instructions?: string
  /** Optional language for prompt selection. */
  lang?: string
  /** Task ID for agent frame identification. */
  taskId?: string
  /** Project ID for PM scope. */
  projectId?: string
}

export type PMAgentRunner = {
  /** ToolLoopAgent instance. */
  agent: ReturnType<typeof createPMAgent>
  /** Frame metadata for the agent. */
  frame: AgentFrame
}

/**
 * Creates a PM agent runner for project management and specialist coordination.
 */
export function createPMAgentRunner(input: PMAgentRunnerInput): PMAgentRunner {
  return {
    agent: createPMAgent({
      model: input.model,
      instructions: input.instructions,
      lang: input.lang,
    }),
    frame: createPMAgentFrame({
      model: input.modelInfo,
      taskId: input.taskId,
      projectId: input.projectId,
    }),
  }
}
