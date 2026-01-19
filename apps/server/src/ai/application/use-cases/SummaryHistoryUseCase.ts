import { runChatStream } from "@/ai/application/services/chatStream/chatStreamService";
import type { ChatStreamRequest } from "@/ai/application/dto/chatStreamTypes";

type SummaryHistoryUseCaseInput = {
  /** Chat request payload. */
  request: ChatStreamRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class SummaryHistoryUseCase {
  /** Execute /summary-history command via chat stream. */
  async execute(input: SummaryHistoryUseCaseInput) {
    // 逻辑：/summary-history 复用 chat stream 的压缩流程。
    return runChatStream(input);
  }
}
