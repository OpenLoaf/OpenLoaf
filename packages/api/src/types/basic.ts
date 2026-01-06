import { z } from "zod";

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

export const basicConfigSchema = z.object({
  chatSource: z.enum(["local", "cloud"]),
  activeS3Id: z.string().optional(),
  s3AutoUpload: z.boolean(),
  s3AutoDeleteHours: z.number().int().min(1).max(168),
  modelResponseLanguage: modelResponseLanguageSchema,
  modelQuality: modelQualitySchema,
  uiLanguage: uiLanguageSchema,
  uiFontSize: uiFontSizeSchema,
  uiTheme: uiThemeSchema,
  uiThemeManual: uiThemeManualSchema,
  appLocalStorageDir: z.string(),
  appAutoBackupDir: z.string(),
  appCustomRules: z.string(),
  modelDefaultChatModelId: z.string(),
  appProjectRule: z.string(),
  stepUpInitialized: z.boolean(),
  proxyEnabled: z.boolean(),
  proxyHost: z.string(),
  proxyPort: z.string(),
  proxyUsername: z.string(),
  proxyPassword: z.string(),
});

export const basicConfigUpdateSchema = basicConfigSchema.partial();

export type BasicConfig = z.infer<typeof basicConfigSchema>;
export type BasicConfigUpdate = z.infer<typeof basicConfigUpdateSchema>;
