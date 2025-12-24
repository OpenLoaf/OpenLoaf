export type SettingScope = "WEB" | "SERVER" | "PUBLIC";

export type SettingDef<T> = {
  key: string;
  defaultValue: T;
  scope: SettingScope;
  secret?: boolean;
  category?: string;
};

export const PublicSettingDefs = {
  AppLocalStorageDir: {
    key: "app.localStorageDir",
    defaultValue: "" as string,
    scope: "PUBLIC",
    category: "storage",
  },
  AppAutoBackupDir: {
    key: "app.autoBackupDir",
    defaultValue: "" as string,
    scope: "PUBLIC",
    category: "storage",
  },
  AppCustomRules: {
    key: "app.customRules",
    defaultValue: "" as string,
    scope: "PUBLIC",
    category: "rules",
  },
  ModelResponseLanguage: {
    key: "model.responseLanguage",
    defaultValue: "zh-CN" as string,
    scope: "PUBLIC",
    category: "model",
  },
  ModelDefaultChatModelId: {
    key: "model.defaultChatModelId",
    defaultValue: "" as string,
    scope: "PUBLIC",
    category: "model",
  },
  ModelChatQuality: {
    key: "model.chatQuality",
    defaultValue: "medium" as string,
    scope: "PUBLIC",
    category: "model",
  },
  ModelChatSource: {
    key: "model.chatSource",
    defaultValue: "" as string,
    scope: "PUBLIC",
    category: "model",
  },
  AppProjectRule: {
    key: "app.projectRule",
    defaultValue: "按项目划分" as string,
    scope: "PUBLIC",
    category: "model",
  },
  ModelProviders: {
    key: "model.providers",
    defaultValue: [] as unknown[],
    scope: "PUBLIC",
    secret: true,
    category: "model",
  },
  AgentConfigs: {
    key: "agent.configs",
    defaultValue: [] as unknown[],
    scope: "PUBLIC",
    category: "agent",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type PublicSettingKey =
  (typeof PublicSettingDefs)[keyof typeof PublicSettingDefs]["key"];
