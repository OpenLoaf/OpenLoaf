import { runChatStream } from "@/ai/chat/chatStreamService";
import type { ChatStreamRequest } from "@/ai/chat/types";

type ChatStreamUseCaseInput = {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class ChatStreamUseCase {
  /** Execute the chat stream use-case. */
  async execute(input: ChatStreamUseCaseInput) {
    return runChatStream(input);
  }
}
