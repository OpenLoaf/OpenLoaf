/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { z } from "zod";
import { t, shieldedProcedure } from "../../generated/routers/helpers/createRouter";
import { basicConfigSchema, basicConfigUpdateSchema } from "../types/basic";

const settingItemSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  value: z.any(),
  secret: z.boolean(),
  category: z.string().optional(),
  isReadonly: z.boolean(),
  syncToCloud: z.boolean().optional(),
});

const cliToolIdSchema = z.enum(["codex", "claudeCode", "python"]);

const cliToolStatusSchema = z.object({
  id: cliToolIdSchema,
  installed: z.boolean(),
  version: z.string().optional(),
  latestVersion: z.string().optional(),
  hasUpdate: z.boolean().optional(),
  /** Installed binary path. */
  path: z.string().optional(),
});

/** System CLI environment info. */
const systemCliInfoSchema = z.object({
  platform: z.enum(["darwin", "linux", "win32", "unknown"]),
  system: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),
  shell: z.object({
    name: z.enum(["bash", "powershell", "unknown"]),
    available: z.boolean(),
    path: z.string().optional(),
    version: z.string().optional(),
  }),
});

const officeInfoSchema = z.object({
  wps: z.object({
    installed: z.boolean(),
    path: z.string().optional(),
    version: z.string().optional(),
  }),
});

/** Skill / Agent scope enum. */
const skillScopeSchema = z.enum(["workspace", "project", "global"]);

/** Skill summary payload. */
const skillSummarySchema = z.object({
  /** Skill name. */
  name: z.string(),
  /** Skill description. */
  description: z.string(),
  /** Skill file path. */
  path: z.string(),
  /** Skill folder name. */
  folderName: z.string(),
  /** Skill ignore key. */
  ignoreKey: z.string().describe("workspace:folder or parentId:folder or folder"),
  /** Skill scope. */
  scope: skillScopeSchema,
  /** Whether the skill is enabled for current scope. */
  isEnabled: z.boolean(),
  /** Whether the skill can be deleted in current list. */
  isDeletable: z.boolean(),
});

/** Capability group payload. */
const capabilityToolSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
});

const capabilityGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  toolIds: z.array(z.string()),
  tools: z.array(capabilityToolSchema),
});

/** Agent summary payload. */
const agentSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  model: z.string(),
  toolIds: z.array(z.string()),
  skills: z.array(z.string()),
  path: z.string(),
  folderName: z.string(),
  ignoreKey: z.string(),
  scope: skillScopeSchema,
  isEnabled: z.boolean(),
  isDeletable: z.boolean(),
  isInherited: z.boolean(),
  isChildProject: z.boolean(),
  isSystem: z.boolean(),
});

export const settingSchemas = {
  getAll: {
    output: z.array(settingItemSchema),
  },
  getProviders: {
    output: z.array(settingItemSchema),
  },
  getS3Providers: {
    output: z.array(settingItemSchema),
  },
  getBasic: {
    output: basicConfigSchema,
  },
  getCliToolsStatus: {
    output: z.array(cliToolStatusSchema),
  },
  systemCliInfo: {
    output: systemCliInfoSchema,
  },
  officeInfo: {
    output: officeInfoSchema,
  },
  /** Get skills summary list. */
  getSkills: {
    input: z
      .object({
        /** Project id for project-scoped skills. */
        projectId: z.string().optional(),
      })
      .optional(),
    output: z.array(skillSummarySchema),
  },
  /** Toggle skill enabled state for workspace or project. */
  setSkillEnabled: {
    input: z.object({
      scope: skillScopeSchema,
      projectId: z.string().optional(),
      ignoreKey: z.string(),
      enabled: z.boolean(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Delete a skill folder. */
  deleteSkill: {
    input: z.object({
      scope: skillScopeSchema,
      projectId: z.string().optional(),
      ignoreKey: z.string(),
      skillPath: z.string(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Get agents summary list. */
  getAgents: {
    input: z
      .object({
        projectId: z.string().optional(),
        includeAllProjects: z.boolean().optional(),
        includeChildProjects: z.boolean().optional(),
        /** Filter agents by scope. Defaults to 'all'. */
        scopeFilter: z.enum(['workspace', 'project', 'all']).optional(),
      })
      .optional(),
    output: z.array(agentSummarySchema),
  },
  /** Toggle agent enabled state. */
  setAgentEnabled: {
    input: z.object({
      scope: skillScopeSchema,
      projectId: z.string().optional(),
      ignoreKey: z.string(),
      enabled: z.boolean(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Delete an agent folder. */
  deleteAgent: {
    input: z.object({
      scope: skillScopeSchema,
      projectId: z.string().optional(),
      ignoreKey: z.string(),
      agentPath: z.string(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Get capability groups. */
  getCapabilityGroups: {
    output: z.array(capabilityGroupSchema),
  },
  /** Get full agent detail by path. */
  getAgentDetail: {
    input: z.object({
      agentPath: z.string(),
      scope: skillScopeSchema,
    }),
    output: z.object({
      name: z.string(),
      description: z.string(),
      icon: z.string(),
      modelLocalIds: z.array(z.string()),
      modelCloudIds: z.array(z.string()),
      auxiliaryModelSource: z.string(),
      auxiliaryModelLocalIds: z.array(z.string()),
      auxiliaryModelCloudIds: z.array(z.string()),
      imageModelIds: z.array(z.string()),
      videoModelIds: z.array(z.string()),
      toolIds: z.array(z.string()),
      skills: z.array(z.string()),
      allowSubAgents: z.boolean(),
      maxDepth: z.number(),
      systemPrompt: z.string(),
      path: z.string(),
      folderName: z.string(),
      scope: skillScopeSchema,
    }),
  },
  /** Copy a workspace agent to a project. */
  copyAgentToProject: {
    input: z.object({
      sourceAgentPath: z.string(),
      projectId: z.string(),
      asMaster: z.boolean().optional(),
    }),
    output: z.object({ ok: z.boolean(), agentPath: z.string() }),
  },
  /** Save (create or update) an agent. */
  saveAgent: {
    input: z.object({
      scope: skillScopeSchema,
      projectId: z.string().optional(),
      /** Existing agent path for update, empty for create. */
      agentPath: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      icon: z.string().optional(),
      modelLocalIds: z.array(z.string()).optional(),
      modelCloudIds: z.array(z.string()).optional(),
      auxiliaryModelSource: z.string().optional(),
      auxiliaryModelLocalIds: z.array(z.string()).optional(),
      auxiliaryModelCloudIds: z.array(z.string()).optional(),
      imageModelIds: z.array(z.string()).optional(),
      videoModelIds: z.array(z.string()).optional(),
      toolIds: z.array(z.string()).optional(),
      skills: z.array(z.string()).optional(),
      allowSubAgents: z.boolean().optional(),
      maxDepth: z.number().optional(),
      systemPrompt: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean(), agentPath: z.string() }),
  },
  set: {
    input: z.object({
      key: z.string(),
      value: z.any(),
      category: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  remove: {
    input: z.object({
      key: z.string(),
      category: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  installCliTool: {
    input: z.object({
      id: cliToolIdSchema,
    }),
    output: z.object({
      ok: z.boolean(),
      status: cliToolStatusSchema,
    }),
  },
  checkCliToolUpdate: {
    input: z.object({
      id: cliToolIdSchema,
    }),
    output: z.object({
      ok: z.boolean(),
      status: cliToolStatusSchema,
    }),
  },
  setBasic: {
    input: basicConfigUpdateSchema,
    output: basicConfigSchema,
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
      getProviders: shieldedProcedure
        .output(settingSchemas.getProviders.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getS3Providers: shieldedProcedure
        .output(settingSchemas.getS3Providers.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getBasic: shieldedProcedure
        .output(settingSchemas.getBasic.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getCliToolsStatus: shieldedProcedure
        .output(settingSchemas.getCliToolsStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      systemCliInfo: shieldedProcedure
        .output(settingSchemas.systemCliInfo.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      officeInfo: shieldedProcedure
        .output(settingSchemas.officeInfo.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getSkills: shieldedProcedure
        .input(settingSchemas.getSkills.input)
        .output(settingSchemas.getSkills.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      setSkillEnabled: shieldedProcedure
        .input(settingSchemas.setSkillEnabled.input)
        .output(settingSchemas.setSkillEnabled.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      deleteSkill: shieldedProcedure
        .input(settingSchemas.deleteSkill.input)
        .output(settingSchemas.deleteSkill.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAgents: shieldedProcedure
        .input(settingSchemas.getAgents.input)
        .output(settingSchemas.getAgents.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      setAgentEnabled: shieldedProcedure
        .input(settingSchemas.setAgentEnabled.input)
        .output(settingSchemas.setAgentEnabled.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      deleteAgent: shieldedProcedure
        .input(settingSchemas.deleteAgent.input)
        .output(settingSchemas.deleteAgent.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getCapabilityGroups: shieldedProcedure
        .output(settingSchemas.getCapabilityGroups.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAgentDetail: shieldedProcedure
        .input(settingSchemas.getAgentDetail.input)
        .output(settingSchemas.getAgentDetail.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      saveAgent: shieldedProcedure
        .input(settingSchemas.saveAgent.input)
        .output(settingSchemas.saveAgent.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      copyAgentToProject: shieldedProcedure
        .input(settingSchemas.copyAgentToProject.input)
        .output(settingSchemas.copyAgentToProject.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      set: shieldedProcedure
        .input(settingSchemas.set.input)
        .output(settingSchemas.set.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      remove: shieldedProcedure
        .input(settingSchemas.remove.input)
        .output(settingSchemas.remove.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      installCliTool: shieldedProcedure
        .input(settingSchemas.installCliTool.input)
        .output(settingSchemas.installCliTool.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      checkCliToolUpdate: shieldedProcedure
        .input(settingSchemas.checkCliToolUpdate.input)
        .output(settingSchemas.checkCliToolUpdate.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      setBasic: shieldedProcedure
        .input(settingSchemas.setBasic.input)
        .output(settingSchemas.setBasic.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const settingRouter = BaseSettingRouter.createRouter();
export type SettingRouter = typeof settingRouter;
