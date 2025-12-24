import type { SettingDef } from "@teatime-ai/api/types/setting";
import { PublicSettingDefs } from "@teatime-ai/api/types/setting";

export const ServerSettingDefs = {
  ...PublicSettingDefs,
  UiLanguage: {
    key: "ui.language",
    defaultValue: "zh-CN",
    category: "basic",
  },
  UiFontSize: {
    key: "ui.fontSize",
    defaultValue: "medium",
    category: "basic",
  },
  UiTheme: {
    key: "ui.theme",
    defaultValue: "system",
    category: "basic",
  },
  UiThemeManual: {
    key: "ui.themeManual",
    defaultValue: "light",
    category: "basic",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type ServerSettingKey =
  (typeof ServerSettingDefs)[keyof typeof ServerSettingDefs]["key"];
