import { mapErrorToMessage } from "./ErrorMapper";

export type ErrorPolicyResult = {
  /** HTTP status for the error. */
  status: number;
  /** User-facing error message. */
  message: string;
};

/** Normalize unknown errors to HTTP responses. */
export function toHttpError(error: unknown, fallbackStatus = 500): ErrorPolicyResult {
  return { status: fallbackStatus, message: mapErrorToMessage(error) };
}
