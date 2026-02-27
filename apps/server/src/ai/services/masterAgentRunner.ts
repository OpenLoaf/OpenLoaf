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
  type MasterAgentModelInfo,
} from '@/ai/services/agentFactory'

type MasterAgentRunnerInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3
  /** Model metadata for the agent frame. */
  modelInfo: MasterAgentModelInfo
  /** Optional tool ids override. */
  toolIds?: readonly string[]
  /** Optional instructions override (assembled from IDENTITY + SOUL + AGENT). */
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
      toolIds: input.toolIds,
      instructions: input.instructions,
    }),
    frame: createMasterAgentFrame({ model: input.modelInfo }),
  }
}
