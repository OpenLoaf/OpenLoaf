/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { runChatStream } from "@/ai/services/chat/chatStreamService";
import type { ChatStreamRequest } from "@/ai/services/chat/types";

type ChatStreamUseCaseInput = {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
  /** SaaS access token from request header. */
  saasAccessToken?: string;
};

export class ChatStreamUseCase {
  /** Execute the chat stream use-case. */
  async execute(input: ChatStreamUseCaseInput) {
    return runChatStream(input);
  }
}
