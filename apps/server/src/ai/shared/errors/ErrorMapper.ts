import type { AiError } from "./AiError";

/** Map internal error to user-facing message. */
export function mapErrorToMessage(error: AiError | unknown): string {
  if (error instanceof Error) return error.message;
  return "请求失败：发生未知错误。";
}
