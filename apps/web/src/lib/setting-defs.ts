import type { SettingDef } from "@tenas-ai/api/types/setting";
import { PublicSettingDefs } from "@tenas-ai/api/types/setting";

export const WebSettingDefs = {
  ...PublicSettingDefs,
  UiLanguage: {
    key: "ui.language",
    defaultValue: "zh-CN" as string,
    category: "basic",
  },
  UiFontSize: {
    key: "ui.fontSize",
    defaultValue: "medium" as string,
    category: "basic",
  },
  UiTheme: {
    key: "ui.theme",
    defaultValue: "system" as string,
    category: "basic",
  },
  UiThemeManual: {
    key: "ui.themeManual",
    defaultValue: "light" as string,
    category: "basic",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type WebSettingKey =
  (typeof WebSettingDefs)[keyof typeof WebSettingDefs]["key"];
