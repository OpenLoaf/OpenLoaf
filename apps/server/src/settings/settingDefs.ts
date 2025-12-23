import type { SettingDef } from "@teatime-ai/api/types/setting";
import { PublicSettingDefs } from "@teatime-ai/api/types/setting";

export const ServerSettingDefs = {
  ...PublicSettingDefs,
  UiLanguage: {
    key: "ui.language",
    defaultValue: "zh-CN",
    scope: "WEB",
    category: "basic",
  },
  UiFontSize: {
    key: "ui.fontSize",
    defaultValue: "medium",
    scope: "WEB",
    category: "basic",
  },
  UiTheme: {
    key: "ui.theme",
    defaultValue: "system",
    scope: "WEB",
    category: "basic",
  },
  UiThemeManual: {
    key: "ui.themeManual",
    defaultValue: "light",
    scope: "WEB",
    category: "basic",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type ServerSettingKey =
  (typeof ServerSettingDefs)[keyof typeof ServerSettingDefs]["key"];
