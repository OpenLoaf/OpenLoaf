/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { toHttpError } from "@/ai/shared/errors/ErrorPolicy";

export abstract class BaseStreamUseCase<TRequest> {
  /** Execute the stream use-case with a request payload. */
  abstract execute(request: TRequest): Promise<Response>;

  /** Normalize unknown errors into user-facing errors. */
  protected handleError(error: unknown): never {
    throw new Error(toHttpError(error).message);
  }
}
