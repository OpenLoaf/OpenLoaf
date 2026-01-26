import type { ChatImageRequest } from "@/ai/image/types";
import { runChatImageRequest } from "@/ai/chat/chatStreamService";

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
