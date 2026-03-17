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
 * Tool input validation wrapper — converts InvalidToolInputError (thrown by AI SDK
 * during schema validation, invisible to model) into tool execution errors
 * (returned to model as tool-error content parts, enabling self-correction).
 *
 * Problem: AI SDK validates tool input against zod schema BEFORE calling execute().
 * If validation fails, it throws InvalidToolInputError which the model never sees.
 * This causes models (especially weaker ones like Kimi K2.5) to retry the exact
 * same invalid input indefinitely.
 *
 * Solution: Replace inputSchema.validate with a lenient version that always succeeds.
 * Store the validation error and throw it from execute() instead, so AI SDK converts
 * it into a tool-error content part that the model can learn from.
 */

import { logger } from '@/common/logger'

/** Symbol to pass validation error from schema to execute. */
const VALIDATION_ERROR = Symbol('validationError')

/**
 * Wrap a tool so that input schema validation errors become tool execution errors.
 *
 * The original JSON schema (sent to the model for parameter descriptions) is preserved.
 * Only the validate behavior changes: invalid input passes through, and the error
 * is thrown from execute() where AI SDK captures it as a tool-error content part.
 */
export function wrapToolWithInputValidation(toolId: string, tool: any): any {
  const originalSchema = tool.inputSchema
  const originalExecute = tool.execute

  if (!originalSchema?.validate || typeof originalExecute !== 'function') {
    return tool
  }

  const originalNeedsApproval = tool.needsApproval

  const wrappedSchema = {
    ...originalSchema,
    validate: async (value: unknown) => {
      const result = await originalSchema.validate(value)
      if (result.success) {
        return result
      }

      // Validation failed — let the value pass through with error attached.
      // The error will be thrown from execute() instead.
      const errorMsg = result.error?.message ?? 'Unknown validation error'
      logger.debug(
        { toolId, error: errorMsg },
        '[tool-input-validation] schema validation failed, deferring to execute for model feedback',
      )

      // Attach validation error to the input object for execute to pick up.
      const passthrough = typeof value === 'object' && value !== null ? { ...value } : {}
      Object.defineProperty(passthrough, VALIDATION_ERROR, {
        value: errorMsg,
        enumerable: false,
      })

      return { success: true, value: passthrough }
    },
  }

  const wrappedExecute = async (input: any, options: any) => {
    // Check if this input was passed through with a validation error
    const validationError = input?.[VALIDATION_ERROR]
    if (validationError) {
      logger.info(
        { toolId, error: validationError },
        '[tool-input-validation] returning validation error as tool execution error',
      )
      throw new Error(
        `Invalid input for tool ${toolId}: ${validationError}`
      )
    }

    return originalExecute(input, options)
  }

  // For needsApproval tools, skip approval when input validation failed so
  // execute() runs immediately and the error is surfaced to the model.
  // Without this, the user would see a broken/empty approval UI.
  const wrappedNeedsApproval = originalNeedsApproval
    ? (input: any) => {
        if (input?.[VALIDATION_ERROR]) return false
        return typeof originalNeedsApproval === 'function'
          ? originalNeedsApproval(input)
          : originalNeedsApproval
      }
    : originalNeedsApproval

  return {
    ...tool,
    inputSchema: wrappedSchema,
    execute: wrappedExecute,
    needsApproval: wrappedNeedsApproval,
  }
}
