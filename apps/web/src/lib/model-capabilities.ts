import type { ModelCapabilities, ModelTag } from "@tenas-ai/api/common";

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

/** Return true when the model supports text generation. */
export function supportsTextGeneration(model: ModelWithTags | null | undefined) {
  return hasTag(model, "chat");
}

/** Return true when the model supports image generation. */
export function supportsImageInput(model: ModelWithTags | null | undefined) {
  return hasTag(model, "image_input");
}

/** Return true when the model supports tool calling. */
export function supportsToolCall(model: ModelWithTags | null | undefined) {
  return hasTag(model, "tool_call");
}

/** Return true when the model supports code generation. */
export function supportsCode(model: ModelWithTags | null | undefined) {
  return hasTag(model, "code");
}

/** Return true when the model supports web search. */
export function supportsWebSearch(model: ModelWithTags | null | undefined) {
  return model?.capabilities?.common?.supportsWebSearch === true;
}
