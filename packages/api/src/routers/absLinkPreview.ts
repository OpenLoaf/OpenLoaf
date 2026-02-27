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
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";

/** Schema map for link preview procedures. */
export const linkPreviewSchemas = {
  capture: {
    input: z.object({
      url: z.string().url(),
      width: z.number().int().min(320).max(1920).optional(),
      height: z.number().int().min(240).max(1080).optional(),
      fullPage: z.boolean().optional(),
    }),
    output: z.object({
      ok: z.literal(true),
      imageUrl: z.string().min(1),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
  },
};

export abstract class BaseLinkPreviewRouter {
  /** Router name for link preview operations. */
  public static routeName = "linkPreview";

  /** Define the link preview router contract. */
  public static createRouter() {
    return t.router({
      capture: shieldedProcedure
        .input(linkPreviewSchemas.capture.input)
        .output(linkPreviewSchemas.capture.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const linkPreviewRouter = BaseLinkPreviewRouter.createRouter();
export type LinkPreviewRouter = typeof linkPreviewRouter;
