/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { ZodError } from "zod";
import superjson from "superjson";
import type { Context } from "./context";

export default {
  transformer: superjson,
  errorFormatter({
    shape,
    error,
    ctx,
  }: {
    shape: any;
    error: any;
    ctx?: Context;
  }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // requestId: ctx?.requestId,
        zodError:
          error.code === "BAD_REQUEST" && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
};
