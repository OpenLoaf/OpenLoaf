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

export const modelResponseLanguageSchema = z.enum([
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
]);

export const modelQualitySchema = z.enum(["high", "medium", "low"]);
export const chatOnlineSearchMemoryScopeSchema = z.enum(["tab", "global"]);
export const chatThinkingModeSchema = z.enum(["fast", "deep"]);

export const uiLanguageSchema = z.enum([
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "de-DE",
  "es-ES",
]);

export const uiFontSizeSchema = z.enum(["small", "medium", "large", "xlarge"]);

export const uiThemeSchema = z.enum(["system", "light", "dark"]);

export const uiThemeManualSchema = z.enum(["light", "dark"]);

// UI animation intensity setting.
export const uiAnimationLevelSchema = z.enum(["low", "medium", "high"]);

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
  /** @deprecated Use per-agent model config instead. */
  toolModelSource: z.enum(["local", "cloud"]),
  activeS3Id: z.string().optional(),
  s3AutoUpload: z.boolean(),
  s3AutoDeleteHours: z.number().int().min(1).max(168),
  modelResponseLanguage: modelResponseLanguageSchema,
  /** @deprecated Use per-agent model config instead. */
  modelQuality: modelQualitySchema,
  chatOnlineSearchMemoryScope: chatOnlineSearchMemoryScopeSchema,
  modelSoundEnabled: z.boolean(),
  /** @deprecated Use scheduled tasks instead. */
  autoSummaryEnabled: z.boolean(),
  /** @deprecated Use scheduled tasks instead. */
  autoSummaryHours: z.array(z.number().int().min(0).max(24)),
  uiLanguage: uiLanguageSchema,
  uiFontSize: uiFontSizeSchema,
  // UI animation intensity.
  uiAnimationLevel: uiAnimationLevelSchema,
  uiTheme: uiThemeSchema,
  uiThemeManual: uiThemeManualSchema,
  /** Show board debug overlay. */
  boardDebugEnabled: z.boolean(),
  /** Show chat preface viewer button. */
  chatPrefaceEnabled: z.boolean(),
  appLocalStorageDir: z.string(),
  appAutoBackupDir: z.string(),
  appCustomRules: z.string(),
  appNotificationSoundEnabled: z.boolean(),
  /** @deprecated Use per-agent model config instead. */
  modelDefaultChatModelId: z.string(),
  /** @deprecated Use per-agent model config instead. */
  modelDefaultToolModelId: z.string(),
  appProjectRule: z.string(),
  /** Allow tools to access paths outside workspace/project roots. */
  toolAllowOutsideScope: z.boolean(),
  stepUpInitialized: z.boolean(),
  proxyEnabled: z.boolean(),
  proxyHost: z.string(),
  proxyPort: z.string(),
  proxyUsername: z.string(),
  proxyPassword: z.string(),
  /** CLI tool settings. */
  cliTools: cliToolsConfigSchema,
});

export const basicConfigUpdateSchema = basicConfigSchema.partial();

export type BasicConfig = z.infer<typeof basicConfigSchema>;
export type BasicConfigUpdate = z.infer<typeof basicConfigUpdateSchema>;
