/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ChatImageRequest } from "@/ai/services/image/types";
import { runChatImageRequest } from "@/ai/services/chat/imageRequestOrchestrator";

type ImageRequestUseCaseInput = {
  /** Image request payload. */
  request: ChatImageRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class ImageRequestUseCase {
  /** Execute image request use-case. */
  async execute(input: ImageRequestUseCaseInput) {
    return runChatImageRequest(input);
  }
}
