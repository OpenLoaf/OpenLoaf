import { z } from "zod";
import { t, shieldedProcedure } from "../index";

/** Schema map for web meta procedures. */
export const webMetaSchemas = {
  capture: {
    input: z.object({
      url: z.string().url(),
      rootUri: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      url: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      logoPath: z.string().optional(),
      previewPath: z.string().optional(),
      error: z.string().optional(),
    }),
  },
};

export abstract class BaseWebMetaRouter {
  /** Router name for web meta operations. */
  public static routeName = "webMeta";

  /** Define the web meta router contract. */
  public static createRouter() {
    return t.router({
      capture: shieldedProcedure
        .input(webMetaSchemas.capture.input)
        .output(webMetaSchemas.capture.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const webMetaRouter = BaseWebMetaRouter.createRouter();
export type WebMetaRouter = typeof webMetaRouter;
