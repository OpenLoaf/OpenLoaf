# Settings 设计方案（单用户版）

## 目标
- 设置持久化统一落在数据库 `Setting` 表
- Workspace 配置不入库，统一由 `apps/server/teatime.conf` 提供
- 可扩展、可审计、支持敏感信息脱敏/保护

## 约束
- 单用户模式：不引入 userId
- 不引入 workspaceId
- 前端 UI 所有设置最终以数据库为准

## 架构概览
- 数据层：`packages/db/prisma/schema/schema.prisma` 的 `Setting` 表
- 服务层：settings service（读取/更新/批量/重置）
- 接口层：tRPC endpoints（UI 读写）
- 客户端：统一 hook + 缓存 + 乐观更新

## Setting 表字段建议
- `key`：分类内唯一键（与 `category` 组成唯一主键）
- `value`：字符串（JSON 存复杂结构）
- `secret`：敏感标记（API Key 等）
- `type`：WEB/SERVER/PUBLIC（用于读写范围与暴露边界）
- `category`：用于 UI 分组显示
- `isReadonly`：只读配置（例如从 server 下发的只读项）

## Setting type 含义约定
- `WEB`：仅 Web 端可读写的配置（UI 偏好类）
- `SERVER`：仅 Server 侧可读写的配置（密钥或服务端逻辑专用）
- `PUBLIC`：Web 与 Server 均可读取（业务通用配置）

## 数据流
- 读取：UI 启动 → `getSettings` → 合并默认值 → 渲染
- 更新：UI 修改 → 本地乐观更新 → `setSetting` → 成功回写
- 迁移：localStorage → Setting（一次性迁移 + 版本标记）

## Setting Key 映射表（基于当前设置页）

### 基础（BasicSettings）
- `ui.language` | type: WEB | category: basic | secret: false
- `ui.fontSize` | type: WEB | category: basic | secret: false
- `ui.theme` | type: WEB | category: basic | secret: false
- `ui.themeManual` | type: WEB | category: basic | secret: false
- `app.localStorageDir` | type: PUBLIC | category: storage | secret: false
- `app.autoBackupDir` | type: PUBLIC | category: storage | secret: false
- `app.customRules` | type: PUBLIC | category: rules | secret: false

### 模型（ModelManagement）
- `model.responseLanguage` | type: PUBLIC | category: model | secret: false
- `model.defaultChatModelId` | type: PUBLIC | category: model | secret: false
- `model.chatQuality` | type: PUBLIC | category: model | secret: false
- `app.projectRule` | type: PUBLIC | category: model | secret: false

### 模型列表（ModelManagement 列表）
- `model.providers` | type: PUBLIC | category: model | secret: true
  - JSON：[{ id, provider, model, apiKey }]

### 服务商（ProviderManagement）
- 单条记录单独存储，category 固定为 `provider`
- key 命名：服务商名称（`name`）
  - 示例：`OPENAI`
- value（JSON）：{ provider, apiUrl, apiKey, modelIds }

### Agent（AgentManagement）
- `agent.configs` | type: PUBLIC | category: agent | secret: false
  - JSON：[{ id, displayName, kind, description, model, tools }]

### 只读/静态项（保持不入库）
- 白名单、快捷键、关于信息等保持常量或运行时注入

## 安全策略
- `secret=true` 时默认脱敏返回（仅保留尾 4 位）
- 需要时可扩展应用级加密（可选）

## Workspace 处理方式
- Workspace 配置仅在 `apps/server/teatime.conf` 中维护
- Settings 页如需展示 workspace 信息，走 server 只读接口返回

## Server/Web 获取入口
- Server 侧提供全局获取方法（如 `getSetting(key)` / `getSettings(keys)`）
- Web 侧提供统一获取方法（如 `useSetting(key)` / `getSetting(key)`）
- 按 `type` 做读写边界校验：WEB 仅 Web，SERVER 仅 Server，PUBLIC 两端可读

## Key 枚举常量与默认值
- 为便于使用与校验，每个 key 需要有枚举常量与默认值
- 结构定义在 `packages/api`，由 Web/Server 复用
- Web 与 Server 包中各自导出枚举常量（可按需拆分只读/只写集合）

### 统一结构定义（放在 packages/api）
```ts
export type SettingScope = "WEB" | "SERVER" | "PUBLIC";

export type SettingDef<T> = {
  key: string;
  defaultValue: T;
  scope: SettingScope;
  secret?: boolean;
  category?: string;
};
```

### 示例枚举（packages/api）
```ts
export const SettingDefs = {
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
  ModelDefaultChatModelId: {
    key: "model.defaultChatModelId",
    defaultValue: "",
    scope: "PUBLIC",
    category: "model",
  },
  KeyOpenAI: {
    key: "key.openai",
    defaultValue: "",
    scope: "SERVER",
    secret: true,
    category: "key",
  },
} as const satisfies Record<string, SettingDef<unknown>>;
```

### Web/Server 导出集合
```ts
export const WebSettingDefs = {
  UiLanguage: SettingDefs.UiLanguage,
  UiFontSize: SettingDefs.UiFontSize,
  ModelDefaultChatModelId: SettingDefs.ModelDefaultChatModelId,
};

export const ServerSettingDefs = {
  ModelDefaultChatModelId: SettingDefs.ModelDefaultChatModelId,
  KeyOpenAI: SettingDefs.KeyOpenAI,
};
```

## 落地步骤建议
1. 新增 settings service + tRPC 接口
2. UI 接入 get/set/bulk
3. localStorage 迁移到 Setting（一次性）
4. 清理 localStorage 依赖
