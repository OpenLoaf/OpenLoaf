/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ModelCapabilities, ModelInputAccept } from "@openloaf/api/common";

type ModelWithCapabilities = {
  /** Model capabilities resolved from provider. */
  capabilities?: ModelCapabilities | null;
};

/** Return true when the model declares the given input accept type. */
function accepts(
  model: ModelWithCapabilities | null | undefined,
  kind: ModelInputAccept,
) {
  return Boolean(model?.capabilities?.inputAccepts?.includes(kind));
}

/** Return true when the model supports native image input. */
export function supportsImageInput(model: ModelWithCapabilities | null | undefined) {
  return accepts(model, "image");
}

/** Return true when the model supports native video input. */
export function supportsVideoInput(model: ModelWithCapabilities | null | undefined) {
  return accepts(model, "video");
}

/** Return true when the model supports native audio input. */
export function supportsAudioInput(model: ModelWithCapabilities | null | undefined) {
  return accepts(model, "audio");
}

