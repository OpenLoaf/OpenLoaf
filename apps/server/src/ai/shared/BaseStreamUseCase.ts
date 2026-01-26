import { toHttpError } from "@/ai/shared/errors/ErrorPolicy";

export abstract class BaseStreamUseCase<TRequest> {
  /** Execute the stream use-case with a request payload. */
  abstract execute(request: TRequest): Promise<Response>;

  /** Normalize unknown errors into user-facing errors. */
  protected handleError(error: unknown): never {
    throw new Error(toHttpError(error).message);
  }
}
