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

/** CLI model definition schema. */
const cliModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()).optional(),
});

/** Skill / Agent scope enum. */
const skillScopeSchema = z.enum(["project", "global"]);

/** Skill summary payload. */
const skillSummarySchema = z.object({
  /** Skill display name (may be translated via openloaf.json). */
  name: z.string(),
  /** Original skill name from SKILL.md front-matter (used for matching/loading). */
  originalName: z.string(),
  /** Skill description. */
  description: z.string(),
  /** Skill file path. */
  path: z.string(),
  /** Skill folder name. */
  folderName: z.string(),
  /** Skill ignore key. */
  ignoreKey: z.string().describe("global:folder or parentId:folder or folder"),
  /** Skill scope. */
  scope: skillScopeSchema,
  /** Whether the skill is enabled for current scope. */
  isEnabled: z.boolean(),
  /** Whether the skill can be deleted in current list. */
  isDeletable: z.boolean(),
  /** Owner project id (for project-scoped skills). */
  ownerProjectId: z.string().optional(),
  /** Owner project title (for project-scoped skills). */
  ownerProjectTitle: z.string().optional(),
  /** Color palette index (0-7). */
  colorIndex: z.number().int().min(0).max(7).nullable().optional(),
  /** Whether this skill has an openloaf.json metadata file. */
  hasMeta: z.boolean().optional(),
  /** Emoji icon for the skill (from openloaf.json). */
  icon: z.string().optional(),
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
  getProjectStorageRoot: {
    output: z.object({
      /** Default project storage root URI (file://...). */
      rootUri: z.string().min(1),
    }),
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
  /** Get Codex CLI available models. */
  getCodexModels: {
    output: z.array(cliModelSchema),
  },
  /** Get Claude Code CLI available models. */
  getClaudeCodeModels: {
    output: z.array(cliModelSchema),
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
  /** Toggle skill enabled state for global or project scope. */
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
  /** Translate a single skill's title (name + description only). Skips if openloaf.json already exists. */
  translateSkillTitle: {
    input: z.object({
      skillFolderPath: z.string(),
      targetLanguage: z.string(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      /** Whether the title was actually translated (false = skipped). */
      translated: z.boolean(),
      name: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  /** Reset a skill's translation data (delete openloaf.json and language folders). */
  resetSkill: {
    input: z.object({
      skillFolderPath: z.string(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Set skill color index (saved to openloaf.json). */
  setSkillColor: {
    input: z.object({
      skillFolderPath: z.string(),
      colorIndex: z.number().int().min(0).max(7).nullable(),
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
        scopeFilter: z.enum(['global', 'project', 'all']).optional(),
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
      codeModelIds: z.array(z.string()),
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
  /** Copy a global agent to a project. */
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
      codeModelIds: z.array(z.string()).optional(),
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
  /** Get memory content by scope ('user' = global, 'project' = project-level). */
  getMemory: {
    input: z
      .object({
        scope: z.enum(['user', 'project']).default('user'),
        projectId: z.string().optional(),
      })
      .optional(),
    output: z.object({
      content: z.string(),
    }),
  },
  /** Get memory directory URI by scope ('user' = global, 'project' = project-level). */
  getMemoryDirUri: {
    input: z
      .object({
        scope: z.enum(['user', 'project']).default('user'),
        projectId: z.string().optional(),
      })
      .optional(),
    output: z.object({
      /** file:// URI of the memory directory. Empty when unresolvable. */
      dirUri: z.string(),
      /** file:// URI of MEMORY.md index file. Empty when unresolvable. */
      indexUri: z.string(),
    }),
  },
  /** Save memory content by scope ('user' = global, 'project' = project-level). */
  saveMemory: {
    input: z.object({
      scope: z.enum(['user', 'project']).default('user'),
      content: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
    }),
  },
  /** Clear all memory files by scope ('user' = global, 'project' = project-level). */
  clearAllMemory: {
    input: z
      .object({
        scope: z.enum(['user', 'project']).default('user'),
        projectId: z.string().optional(),
      })
      .optional(),
    output: z.object({
      ok: z.boolean(),
      deletedCount: z.number(),
    }),
  },
  /** Get skills for a sub-agent by name. */
  getAgentSkillsByName: {
    input: z.object({
      agentName: z.string(),
    }),
    output: z.object({
      skills: z.array(z.string()),
    }),
  },
  /** Save skills for a sub-agent by name. */
  saveAgentSkillsByName: {
    input: z.object({
      agentName: z.string(),
      skills: z.array(z.string()),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Get auxiliary model config. */
  getAuxiliaryModelConfig: {
    output: z.object({
      modelSource: z.enum(["local", "cloud", "saas"]),
      localModelIds: z.array(z.string()),
      cloudModelIds: z.array(z.string()),
      capabilities: z.record(
        z.string(),
        z.object({
          customPrompt: z.string().nullable().optional(),
        }),
      ),
      /** SaaS quota info (only present when modelSource is "saas"). */
      quota: z.object({
        used: z.number(),
        limit: z.number(),
        remaining: z.number(),
        resetsAt: z.string(),
      }).optional(),
    }),
  },
  /** Save auxiliary model config. */
  saveAuxiliaryModelConfig: {
    input: z.object({
      modelSource: z.enum(["local", "cloud", "saas"]).optional(),
      localModelIds: z.array(z.string()).optional(),
      cloudModelIds: z.array(z.string()).optional(),
      capabilities: z
        .record(
          z.string(),
          z.object({
            customPrompt: z.string().nullable().optional(),
          }),
        )
        .optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  /** Get SaaS auxiliary quota. */
  getAuxiliaryQuota: {
    output: z.object({
      quota: z.object({
        used: z.number(),
        limit: z.number(),
        remaining: z.number(),
        resetsAt: z.string(),
      }),
    }),
  },
  /** Get auxiliary capability definitions. */
  getAuxiliaryCapabilities: {
    output: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        triggers: z.array(z.string()),
        defaultPrompt: z.string(),
        outputMode: z.enum(['structured', 'text', 'tool-call', 'skill']),
        outputSchema: z.record(z.string(), z.unknown()),
      }),
    ),
  },
  /** Test an auxiliary capability with user-provided context. */
  testAuxiliaryCapability: {
    input: z.object({
      capabilityKey: z.string(),
      context: z.string(),
      customPrompt: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      result: z.unknown(),
      error: z.string().optional(),
      durationMs: z.number(),
      usage: z.object({
        inputTokens: z.number(),
        cachedInputTokens: z.number(),
        outputTokens: z.number(),
        totalTokens: z.number(),
      }).optional(),
    }),
  },
  /** Infer project type via auxiliary model and update project.json. */
  inferProjectType: {
    input: z.object({
      projectId: z.string(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      projectType: z.string(),
      icon: z.string().optional(),
      confidence: z.number(),
    }),
  },
  /** Infer project name, icon and type via auxiliary model. */
  inferProjectName: {
    input: z.object({
      projectId: z.string(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      title: z.string(),
      icon: z.string(),
      type: z.string(),
    }),
  },
  /** Generate dynamic chat suggestions based on project context. */
  generateChatSuggestions: {
    input: z.object({
      projectId: z.string().optional(),
      currentInput: z.string().optional(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      suggestions: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
          type: z.enum(['completion', 'question', 'action']),
        }),
      ),
    }),
  },
  /** Generate commit message via auxiliary model. */
  generateCommitMessage: {
    input: z.object({
      projectId: z.string(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      subject: z.string(),
      body: z.string(),
    }),
  },
  /** Infer board name via auxiliary model. */
  inferBoardName: {
    input: z.object({
      boardFolderUri: z.string(),
      projectId: z.string().optional(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      title: z.string(),
    }),
  },
  /** Get skill translation status. */
  getSkillTranslationStatus: {
    input: z.object({
      skillFolderPath: z.string(),
      targetLanguage: z.string().optional(),
    }),
    output: z.object({
      status: z.enum(['not-translated', 'translated', 'needs-update']),
      displayName: z.string().optional(),
      description: z.string().optional(),
      translatedAt: z.string().optional(),
      sourceLanguage: z.string().optional(),
    }),
  },
  /** Translate a skill to the target language. */
  translateSkill: {
    input: z.object({
      skillFolderPath: z.string(),
      targetLanguage: z.string(),
      saasAccessToken: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      translatedFiles: z.number(),
      skippedFiles: z.number(),
      error: z.string().optional(),
    }),
  },
  /** Export a skill folder as a zip archive (base64-encoded). */
  exportSkill: {
    input: z.object({
      skillFolderPath: z.string(),
    }),
    output: z.object({
      ok: z.boolean(),
      /** Base64-encoded zip content. */
      contentBase64: z.string().optional(),
      /** Suggested file name for download. */
      fileName: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  /** Import a skill from a local folder or archive path. */
  importSkill: {
    input: z.object({
      sourcePath: z.string(),
      scope: skillScopeSchema,
      projectId: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      importedSkills: z.array(z.string()),
      error: z.string().optional(),
    }),
  },
  /** Copy or move a skill to another scope (global or project). */
  transferSkill: {
    input: z.object({
      /** Source skill folder path (absolute). */
      skillFolderPath: z.string(),
      /** Operation mode. */
      mode: z.enum(['copy', 'move']),
      /** Target scope. */
      targetScope: skillScopeSchema,
      /** Target project id (required when targetScope is 'project'). */
      targetProjectId: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      /** The folder name of the transferred skill. */
      folderName: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  /** Import a skill from an uploaded archive (base64). */
  importSkillFromArchive: {
    input: z.object({
      contentBase64: z.string(),
      fileName: z.string(),
      scope: skillScopeSchema,
      projectId: z.string().optional(),
    }),
    output: z.object({
      ok: z.boolean(),
      importedSkills: z.array(z.string()),
      error: z.string().optional(),
    }),
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
      getProjectStorageRoot: shieldedProcedure
        .output(settingSchemas.getProjectStorageRoot.output)
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
      getCodexModels: shieldedProcedure
        .output(settingSchemas.getCodexModels.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getClaudeCodeModels: shieldedProcedure
        .output(settingSchemas.getClaudeCodeModels.output)
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
      resetSkill: shieldedProcedure
        .input(settingSchemas.resetSkill.input)
        .output(settingSchemas.resetSkill.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      translateSkillTitle: shieldedProcedure
        .input(settingSchemas.translateSkillTitle.input)
        .output(settingSchemas.translateSkillTitle.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      setSkillColor: shieldedProcedure
        .input(settingSchemas.setSkillColor.input)
        .output(settingSchemas.setSkillColor.output)
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
      getMemory: shieldedProcedure
        .input(settingSchemas.getMemory.input)
        .output(settingSchemas.getMemory.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getMemoryDirUri: shieldedProcedure
        .input(settingSchemas.getMemoryDirUri.input)
        .output(settingSchemas.getMemoryDirUri.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      saveMemory: shieldedProcedure
        .input(settingSchemas.saveMemory.input)
        .output(settingSchemas.saveMemory.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      clearAllMemory: shieldedProcedure
        .input(settingSchemas.clearAllMemory.input)
        .output(settingSchemas.clearAllMemory.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAgentSkillsByName: shieldedProcedure
        .input(settingSchemas.getAgentSkillsByName.input)
        .output(settingSchemas.getAgentSkillsByName.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      saveAgentSkillsByName: shieldedProcedure
        .input(settingSchemas.saveAgentSkillsByName.input)
        .output(settingSchemas.saveAgentSkillsByName.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAuxiliaryModelConfig: shieldedProcedure
        .output(settingSchemas.getAuxiliaryModelConfig.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      saveAuxiliaryModelConfig: shieldedProcedure
        .input(settingSchemas.saveAuxiliaryModelConfig.input)
        .output(settingSchemas.saveAuxiliaryModelConfig.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAuxiliaryQuota: shieldedProcedure
        .output(settingSchemas.getAuxiliaryQuota.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      getAuxiliaryCapabilities: shieldedProcedure
        .output(settingSchemas.getAuxiliaryCapabilities.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      testAuxiliaryCapability: shieldedProcedure
        .input(settingSchemas.testAuxiliaryCapability.input)
        .output(settingSchemas.testAuxiliaryCapability.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      inferProjectType: shieldedProcedure
        .input(settingSchemas.inferProjectType.input)
        .output(settingSchemas.inferProjectType.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      inferProjectName: shieldedProcedure
        .input(settingSchemas.inferProjectName.input)
        .output(settingSchemas.inferProjectName.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      generateChatSuggestions: shieldedProcedure
        .input(settingSchemas.generateChatSuggestions.input)
        .output(settingSchemas.generateChatSuggestions.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      generateCommitMessage: shieldedProcedure
        .input(settingSchemas.generateCommitMessage.input)
        .output(settingSchemas.generateCommitMessage.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      inferBoardName: shieldedProcedure
        .input(settingSchemas.inferBoardName.input)
        .output(settingSchemas.inferBoardName.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      getSkillTranslationStatus: shieldedProcedure
        .input(settingSchemas.getSkillTranslationStatus.input)
        .output(settingSchemas.getSkillTranslationStatus.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      translateSkill: shieldedProcedure
        .input(settingSchemas.translateSkill.input)
        .output(settingSchemas.translateSkill.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      exportSkill: shieldedProcedure
        .input(settingSchemas.exportSkill.input)
        .output(settingSchemas.exportSkill.output)
        .query(async () => {
          throw new Error("Not implemented in base class");
        }),
      transferSkill: shieldedProcedure
        .input(settingSchemas.transferSkill.input)
        .output(settingSchemas.transferSkill.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      importSkill: shieldedProcedure
        .input(settingSchemas.importSkill.input)
        .output(settingSchemas.importSkill.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
      importSkillFromArchive: shieldedProcedure
        .input(settingSchemas.importSkillFromArchive.input)
        .output(settingSchemas.importSkillFromArchive.output)
        .mutation(async () => {
          throw new Error("Not implemented in base class");
        }),
    });
  }
}

export const settingRouter = BaseSettingRouter.createRouter();
export type SettingRouter = typeof settingRouter;
