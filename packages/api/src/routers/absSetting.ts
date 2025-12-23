import { z } from "zod";
import { t, shieldedProcedure } from "../index";
const settingScopeSchema = z.enum(["WEB", "SERVER", "PUBLIC"]);

const settingItemSchema = z.object({
  key: z.string(),
  value: z.any(),
  scope: settingScopeSchema,
  secret: z.boolean(),
  category: z.string().optional(),
  isReadonly: z.boolean(),
});

export const settingSchemas = {
  getAll: {
    output: z.array(settingItemSchema),
  },
  set: {
    input: z.object({
      key: z.string(),
      value: z.any(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
};

export abstract class BaseSettingRouter {
  public static routeName = "settings";

  /** Define the settings router contract. */
  public static createRouter() {
    return t.router({
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const settingRouter = BaseSettingRouter.createRouter();
export type SettingRouter = typeof settingRouter;
