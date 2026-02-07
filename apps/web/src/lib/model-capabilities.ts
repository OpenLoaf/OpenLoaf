type ModelWithTags = {
  /** Model tags declared by the provider. */
  tags?: readonly string[] | null;
};

/** Return true when the model declares the given tag. */
function hasTag(model: ModelWithTags | null | undefined, tag: string) {
  // 中文注释：统一处理 tags 为空的情况。
  return Boolean(model?.tags?.includes(tag));
}

/** Return true when the model supports text generation. */
export function supportsTextGeneration(model: ModelWithTags | null | undefined) {
  return hasTag(model, "chat");
}

/** Return true when the model supports image generation. */
export function supportsImageGeneration(model: ModelWithTags | null | undefined) {
  return hasTag(model, "image_generation");
}

/** Return true when the model supports image editing. */
export function supportsImageEdit(model: ModelWithTags | null | undefined) {
  return hasTag(model, "image_edit");
}

/** Return true when the model supports image input. */
export function supportsImageInput(model: ModelWithTags | null | undefined) {
  return hasTag(model, "image_input");
}

/** Return true when the model supports video generation. */
export function supportsVideoGeneration(model: ModelWithTags | null | undefined) {
  return hasTag(model, "video_generation");
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
  return hasTag(model, "web_search");
}

/** Return true when the model supports speech generation. */
export function supportsSpeechGeneration(model: ModelWithTags | null | undefined) {
  return hasTag(model, "speech_generation");
}
