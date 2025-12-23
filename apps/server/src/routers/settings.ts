import { BaseSettingRouter, settingSchemas, t, shieldedProcedure } from "@teatime-ai/api";
import { getSettingsForWeb, setSettingValueFromWeb } from "@/modules/settings/settingsService";

export class SettingRouterImpl extends BaseSettingRouter {
  /** Settings read/write (server-side). */
  public static createRouter() {
    return t.router({
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          return await getSettingsForWeb();
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async ({ input }) => {
          await setSettingValueFromWeb(input.key, input.value);
          return { ok: true };
        }),
    });
  }
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter();
