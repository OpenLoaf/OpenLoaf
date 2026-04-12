/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ModelCapabilities, ModelTag } from "@openloaf/api/common";

type ModelWithTags = {
  /** Model tags declared by the provider. */
  tags?: readonly ModelTag[] | null;
  /** Model capabilities resolved from provider. */
  capabilities?: ModelCapabilities | null;
};

/** Return true when the model declares the given tag. */
function hasTag(model: ModelWithTags | null | undefined, tag: ModelTag) {
  // 中文注释：能力标签仍以 tags 为准。
  return Boolean(model?.tags?.includes(tag));
}

/** Return true when the model supports image input (understanding or analysis). */
export function supportsImageInput(model: ModelWithTags | null | undefined) {
  return hasTag(model, "image_input") || hasTag(model, "image_analysis");
}

/** Return true when the model supports tool calling. */
export function supportsToolCall(model: ModelWithTags | null | undefined) {
  return hasTag(model, "tool_call");
}

/** Return true when the model supports code generation. */
export function supportsCode(model: ModelWithTags | null | undefined) {
  return hasTag(model, "code");
}

