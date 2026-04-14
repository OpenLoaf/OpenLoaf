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

export const chatOnlineSearchMemoryScopeSchema = z.enum(["tab", "global"]);
export const chatThinkingModeSchema = z.enum(["fast", "deep"]);

export const uiLanguageSchema = z.enum([
  "zh-CN",
  "zh-TW",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
]);

/** AI prompt language — language used when loading built-in agent system prompts. */
export const promptLanguageSchema = z.enum(["zh", "en"]);

export const uiFontSizeSchema = z.enum(["small", "medium", "large", "xlarge"]);

export const uiThemeSchema = z.enum(["system", "light", "dark"]);

export const uiThemeManualSchema = z.enum(["light", "dark"]);

// UI animation intensity setting.
export const uiAnimationLevelSchema = z.enum(["low", "medium", "high"]);

export const projectOpenModeSchema = z.enum(["sidebar", "window"]);

/** CLI tool config schema. */
export const cliToolConfigSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string(),
  forceCustomApiKey: z.boolean(),
});

/** CLI tools config schema. */
export const cliToolsConfigSchema = z.object({
  codex: cliToolConfigSchema,
  claudeCode: cliToolConfigSchema,
  python: cliToolConfigSchema,
});

export type CliToolConfig = {
  /** API base URL. */
  apiUrl: string;
  /** API key. */
  apiKey: string;
  /** Force using custom API key. */
  forceCustomApiKey: boolean;
};

export type CliToolsConfig = {
  /** Codex CLI config. */
  codex: CliToolConfig;
  /** Claude Code CLI config. */
  claudeCode: CliToolConfig;
  /** Python CLI config. */
  python: CliToolConfig;
};

export const basicConfigSchema = z.object({
  /** @deprecated Use per-agent model config instead. */
  chatSource: z.enum(["local", "cloud"]),
  /** Chat reasoning mode for master agent. */
  chatThinkingMode: chatThinkingModeSchema,
  activeS3Id: z.string().optional(),
  s3AutoUpload: z.boolean(),
  s3AutoDeleteHours: z.number().int().min(1).max(168),
  chatOnlineSearchMemoryScope: chatOnlineSearchMemoryScopeSchema,
  modelSoundEnabled: z.boolean(),
  /** @deprecated Use scheduled tasks instead. */
  autoSummaryEnabled: z.boolean(),
  /** @deprecated Use scheduled tasks instead. */
  autoSummaryHours: z.array(z.number().int().min(0).max(24)),
  uiLanguage: uiLanguageSchema.nullable(),
  uiFontSize: uiFontSizeSchema,
  // UI animation intensity.
  uiAnimationLevel: uiAnimationLevelSchema,
  uiTheme: uiThemeSchema,
  uiThemeManual: uiThemeManualSchema,
  projectOpenMode: projectOpenModeSchema,
  /** Show board debug overlay. */
  boardDebugEnabled: z.boolean(),
  /** Enable snap-to-align guides when dragging/resizing board nodes. */
  boardSnapEnabled: z.boolean(),
  /** Show chat preface viewer button. */
  chatPrefaceEnabled: z.boolean(),
  appLocalStorageDir: z.string(),
  /** Temporary storage directory for temp projects and canvases. */
  appTempStorageDir: z.string(),
  appAutoBackupDir: z.string(),
  appCustomRules: z.string(),
  appNotificationSoundEnabled: z.boolean(),
  appProjectRule: z.string(),
  /** Auto-approve simple tool calls without manual confirmation. */
  autoApproveTools: z.boolean(),
  stepUpInitialized: z.boolean(),
  proxyEnabled: z.boolean(),
  proxyHost: z.string(),
  proxyPort: z.string(),
  proxyUsername: z.string(),
  proxyPassword: z.string(),
  /** CLI tool settings. */
  cliTools: cliToolsConfigSchema,
  /** Web search provider id (empty or 'none' = disabled). */
  webSearchProvider: z.string(),
  /** Web search API key. */
  webSearchApiKey: z.string(),
  /** Show all tool call results in chat message list. */
  chatShowAllToolResults: z.boolean(),
  /** Show the dev-stage notice dialog on startup. */
  showDevNoticeDialog: z.boolean(),
  /** Language for AI prompts (agent system prompts). */
  promptLanguage: promptLanguageSchema,
});

export const basicConfigUpdateSchema = basicConfigSchema.partial();

export type BasicConfig = z.infer<typeof basicConfigSchema>;
export type BasicConfigUpdate = z.infer<typeof basicConfigUpdateSchema>;
