/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const openUrlToolDef = {
  id: "OpenUrl",
  readonly: true,
  name: "Open Url",
  description:
    "Open a URL in the in-app browser for the user to view or interact with. See browser-ops skill for usage.",
  parameters: z.object({
    url: z.string().min(1).describe("Protocol optional."),
    title: z.string().optional(),
    timeoutSec: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Seconds to wait for frontend to finish. Default 60."),
  }),
  component: null,
} as const;
