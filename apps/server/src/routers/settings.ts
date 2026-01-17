import {
  BaseSettingRouter,
  getProjectRootPath,
  getWorkspaceRootPath,
  settingSchemas,
  shieldedProcedure,
  t,
} from "@tenas-ai/api";
import {
  deleteSettingValueFromWeb,
  getBasicConfigForWeb,
  getProviderSettingsForWeb,
  getS3ProviderSettingsForWeb,
  getSettingsForWeb,
  setBasicConfigFromWeb,
  setSettingValueFromWeb,
} from "@/modules/settings/settingsService";
import {
  checkCliToolUpdate,
  getCliToolsStatus,
  installCliTool,
} from "@/ai/models/cli/cliToolService";
import { loadSkillSummaries } from "@/ai/agents/masterAgent/skillsLoader";

export class SettingRouterImpl extends BaseSettingRouter {
  /** Settings read/write (server-side). */
  public static createRouter() {
    return t.router({
      getAll: shieldedProcedure
        .output(settingSchemas.getAll.output)
        .query(async () => {
          return await getSettingsForWeb();
        }),
      getProviders: shieldedProcedure
        .output(settingSchemas.getProviders.output)
        .query(async () => {
          return await getProviderSettingsForWeb();
        }),
      getS3Providers: shieldedProcedure
        .output(settingSchemas.getS3Providers.output)
        .query(async () => {
          return await getS3ProviderSettingsForWeb();
        }),
      getBasic: shieldedProcedure
        .output(settingSchemas.getBasic.output)
        .query(async () => {
          return await getBasicConfigForWeb();
        }),
      getCliToolsStatus: shieldedProcedure
        .output(settingSchemas.getCliToolsStatus.output)
        .query(async () => {
          return await getCliToolsStatus();
        }),
      /** List skills for settings UI. */
      getSkills: shieldedProcedure
        .input(settingSchemas.getSkills.input)
        .output(settingSchemas.getSkills.output)
        .query(async ({ input }) => {
          const workspaceRootPath = getWorkspaceRootPath();
          const projectRootPath = input?.projectId
            ? getProjectRootPath(input.projectId) ?? undefined
            : undefined;
          // 中文注释：优先读取项目技能，同时包含工作空间级别技能。
          return loadSkillSummaries({ workspaceRootPath, projectRootPath });
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async ({ input }) => {
          await setSettingValueFromWeb(input.key, input.value, input.category);
          return { ok: true };
        }),
      remove: shieldedProcedure
        .input(settingSchemas.remove.input)
        .output(settingSchemas.remove.output)
        .mutation(async ({ input }) => {
          await deleteSettingValueFromWeb(input.key, input.category);
          return { ok: true };
        }),
      installCliTool: shieldedProcedure
        .input(settingSchemas.installCliTool.input)
        .output(settingSchemas.installCliTool.output)
        .mutation(async ({ input }) => {
          const status = await installCliTool(input.id);
          return { ok: true, status };
        }),
      checkCliToolUpdate: shieldedProcedure
        .input(settingSchemas.checkCliToolUpdate.input)
        .output(settingSchemas.checkCliToolUpdate.output)
        .mutation(async ({ input }) => {
          const status = await checkCliToolUpdate(input.id);
          return { ok: true, status };
        }),
      setBasic: shieldedProcedure
        .input(settingSchemas.setBasic.input)
        .output(settingSchemas.setBasic.output)
        .mutation(async ({ input }) => {
          return await setBasicConfigFromWeb(input);
        }),
    });
  }
}

export const settingsRouterImplementation = SettingRouterImpl.createRouter();
