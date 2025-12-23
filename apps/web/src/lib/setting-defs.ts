import type { SettingDef } from "@teatime-ai/api/types/setting";
import { PublicSettingDefs } from "@teatime-ai/api/types/setting";

export const WebSettingDefs = {
  ...PublicSettingDefs,
  UiLanguage: {
    key: "ui.language",
    defaultValue: "zh-CN" as string,
    scope: "WEB",
    category: "basic",
  },
  UiFontSize: {
    key: "ui.fontSize",
    defaultValue: "medium" as string,
    scope: "WEB",
    category: "basic",
  },
  UiTheme: {
    key: "ui.theme",
    defaultValue: "system" as string,
    scope: "WEB",
    category: "basic",
  },
  UiThemeManual: {
    key: "ui.themeManual",
    defaultValue: "light" as string,
    scope: "WEB",
    category: "basic",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type WebSettingKey =
  (typeof WebSettingDefs)[keyof typeof WebSettingDefs]["key"];
