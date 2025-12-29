# Yjs 存储方案（纯 Yjs + Block 物化视图）

本方案参考 AFFiNE 的 "snapshot + updates" 模式，目标是用 Yjs 作为唯一事实源，
保留最小元数据表与 Block 物化视图，支持历史查看与离线同步。

## 目标
- 每个 Container 一个 Y.Doc。
- 服务器只持久化 Yjs 二进制（snapshot + updates）。
- 保留最小元数据表（title/updatedAt/权限等）。
- 保留 Block 表作为搜索/统计用的物化视图。
- 前端 IndexedDB 使用 snapshots + updates + clocks。
- 资源仅存引用（Resource 表），Yjs 中只写 resourceId。

## 参考 AFFiNE 的关键点
- snapshot + update log：`/Users/zhao/Documents/01.Code/Github/AFFiNE/packages/common/nbstore/src/storage/doc.ts`
- IDB schema：`/Users/zhao/Documents/01.Code/Github/AFFiNE/packages/common/nbstore/src/impls/idb/schema.ts`
- 文档/画布在同一 Y.Doc：`/Users/zhao/Documents/01.Code/Github/AFFiNE/docs/文档与画布数据存储与快照流程.md`

## 数据模型（服务端）
### Container（元数据表）
- 只存最小信息，Yjs 才是内容与结构的事实源。

```prisma
model Container {
  id          String   @id @default(cuid())
  workspaceId String
  title       String?
  icon        String?
  cover       String?
  permissions Json?
  blocks      Block[]
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}
```

### YjsSnapshot（最新快照）
- 每个 container 只保留 1 份最新 snapshot。

```prisma
model YjsSnapshot {
  containerId String @id
  bin         Bytes
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}
```

### YjsUpdate（更新日志）
- 追加写入，合并后可清理。

```prisma
model YjsUpdate {
  id          String   @id @default(cuid())
  containerId String
  bin         Bytes
  actorId     String?
  createdAt   DateTime @default(now())
  merged      Boolean  @default(false)

  @@index([containerId, createdAt])
  @@index([containerId, merged])
}
```

### YjsHistory（历史快照）
- 用于“查看历史”的需求。
- 历史快照是二进制 Yjs snapshot（不是结构化 JSON）。

```prisma
model YjsHistory {
  id          String   @id @default(cuid())
  containerId String
  bin         Bytes
  createdAt   DateTime @default(now())
  reason      String?

  @@index([containerId, createdAt])
}
```

### Block（物化视图）
- 由 Yjs 解码后生成，供搜索/统计/列表使用。
- 不参与协作冲突，不作为事实源。
- 关联关系通过 `Block.containerId`，可按 containerId 查询该容器下的块。

```prisma
model Block {
  id          String   @id
  containerId String
  container   Container @relation(fields: [containerId], references: [id], onDelete: Cascade)
  type        String
  props       Json?
  content     Json?
  parentId    String?
  order       Float
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())

  @@index([containerId])
}
```

### Resource（资源引用）
- 资源与附件独立存放，只在 Yjs 中存 resourceId。
- Resource 表继续使用，关联字段由 pageId 改为 containerId。

## Yjs 文档结构（建议）
```ts
type YDocSchema = {
  meta: {
    title?: string;
    icon?: string;
    cover?: string;
  };
  structure: {
    blocks: Array<{ id: string; parentId?: string; order: number; type: string }>;
  };
  layout: {
    nodes: Array<{ id: string; kind: "block" | "node"; blockId?: string; xywh: [number, number, number, number] }>;
    connectors: Array<any>;
    viewport: { zoom: number; offset: [number, number] };
  };
  resources: Array<{ resourceId: string }>;
};
```

## 更新与持久化流程（核心）
1. 客户端编辑产生 Yjs update。  
2. 本地 IDB `updates` 追加保存，并通过 WS 推送到服务端。  
3. 服务端写入 `YjsUpdate`，更新 `Container.updatedAt`。  
4. 当满足合并条件时（数量阈值或时间阈值）触发合并任务。  
5. 合并任务生成最新 `YjsSnapshot`，并标记已合并的 `YjsUpdate`。  
6. 合并完成后执行“物化任务”，更新 Block 表与元数据。  

## 合并与历史策略
- **合并条件**：  
  - updates 数量 >= `mergeUpdateCount`  
  - 或距离上次合并 >= `mergeIntervalMs`  
- **历史写入条件**（满足“能看到历史”）：  
  - 距离上一次历史快照 >= `historyMinIntervalMs`  
  - 或用户触发“手动保存/发布”  
- **清理策略**：  
  - 超过 `historyMaxAgeDays` 的历史快照清理  
  - 超过 `historyMaxCount` 的旧历史清理  

推荐默认值：
- `mergeUpdateCount = 200`
- `mergeIntervalMs = 120000` (2 分钟)
- `historyMinIntervalMs = 300000` (5 分钟)
- `historyMaxAgeDays = 90`
- `historyMaxCount = 200`

## 物化流程（Yjs -> Block）
- 合并后读取最新 YjsSnapshot，构建临时 Y.Doc。  
- 遍历 Yjs 结构生成 Block 行（upsert）。  
- 删除本次未出现的 blockId（保持一致）。  
- 同步更新 Container.title/icon/cover 等元数据。  

## 历史查看
- 按 `YjsHistory` 的时间戳列表展示历史。  
- 选择某条历史时，取 `bin` 还原临时 Y.Doc 供预览/恢复。  
- 恢复操作：将该历史快照作为新 snapshot，并写入一条新的 history 记录。

## 前端 IndexedDB（本地缓存）
- snapshots / updates / clocks 三表模型，保持 AFFiNE 一致。  
- 启动流程：  
  1) 从 snapshot + updates 还原 Y.Doc  
  2) 获取服务端 diff（stateVector）补齐  
- 跨 Tab 用 BroadcastChannel 通知更新。

## 迁移建议（从 Page/Board/Block/Snapshot 迁移）
1) 将现有 Page + Board 组装成 Y.Doc，生成初始 YjsSnapshot。  
2) 写入 Container 元数据（title/icon/cover/permissions）。  
3) Block 表保留并标记为物化视图。  
4) Snapshot 表停止写入并逐步下线。  

## 不做的事
- 不再维护结构化 Snapshot 表（纯 Yjs）。  
- 不在服务端实时保存“每次编辑的结构化历史”。  
