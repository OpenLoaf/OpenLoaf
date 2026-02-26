/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { SettingDef } from "@openloaf/api/types/setting";
import { PublicSettingDefs } from "@openloaf/api/types/setting";

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
