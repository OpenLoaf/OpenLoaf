export type SettingDef<T> = {
  key: string;
  defaultValue: T;
  secret?: boolean;
  category?: string;
  syncToCloud?: boolean;
};

export const PublicSettingDefs = {
  AppLocalStorageDir: {
    key: "app.localStorageDir",
    defaultValue: "" as string,
    category: "storage",
  },
  AppAutoBackupDir: {
    key: "app.autoBackupDir",
    defaultValue: "" as string,
    category: "storage",
  },
  AppCustomRules: {
    key: "app.customRules",
    defaultValue: "" as string,
    category: "rules",
  },
  ModelResponseLanguage: {
    key: "model.responseLanguage",
    defaultValue: "zh-CN" as string,
    category: "model",
  },
  ModelDefaultChatModelId: {
    key: "model.defaultChatModelId",
    defaultValue: "" as string,
    category: "model",
  },
  ModelChatQuality: {
    key: "model.chatQuality",
    defaultValue: "medium" as string,
    category: "model",
  },
  ModelChatSource: {
    key: "model.chatSource",
    defaultValue: "local" as string,
    category: "model",
  },
  ModelProviders: {
    key: "model.providers",
    defaultValue: [] as unknown[],
    secret: true,
    category: "model",
  },
  AppProjectRule: {
    key: "app.projectRule",
    defaultValue: "按项目划分" as string,
    category: "model",
  },
  StepUpInitialized: {
    key: "stepUp.initialized",
    defaultValue: false as boolean,
    category: "stepUp",
  },
  ProxyEnabled: {
    key: "proxy.enabled",
    defaultValue: false as boolean,
    category: "proxy",
    syncToCloud: false,
  },
  ProxyHost: {
    key: "proxy.host",
    defaultValue: "" as string,
    category: "proxy",
    syncToCloud: false,
  },
  ProxyPort: {
    key: "proxy.port",
    defaultValue: "" as string,
    category: "proxy",
    syncToCloud: false,
  },
  ProxyUsername: {
    key: "proxy.username",
    defaultValue: "" as string,
    category: "proxy",
    syncToCloud: false,
  },
  ProxyPassword: {
    key: "proxy.password",
    defaultValue: "" as string,
    secret: true,
    category: "proxy",
    syncToCloud: false,
  },
  AgentConfigs: {
    key: "agent.configs",
    defaultValue: [] as unknown[],
    category: "agent",
  },
} as const satisfies Record<string, SettingDef<unknown>>;

export type PublicSettingKey =
  (typeof PublicSettingDefs)[keyof typeof PublicSettingDefs]["key"];
