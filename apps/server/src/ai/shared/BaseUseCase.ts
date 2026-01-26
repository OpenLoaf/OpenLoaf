import { toHttpError } from "@/ai/shared/errors/ErrorPolicy";

export abstract class BaseUseCase<TRequest, TResponse> {
  /** Execute the use-case with a request payload. */
  abstract execute(request: TRequest): Promise<TResponse>;

  /** Normalize unknown errors into user-facing errors. */
  protected handleError(error: unknown): never {
    throw new Error(toHttpError(error).message);
  }
}
