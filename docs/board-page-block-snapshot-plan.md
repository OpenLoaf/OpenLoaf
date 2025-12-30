# Board/Page/Block Snapshot Plan

## 目标
- Board 当前态使用 JSON 快照，便于快速保存与恢复。
- 历史记录只读；需要编辑时，通过“覆盖当前态”完成恢复。
- Page/Block/Board 历史统一到一张 Snapshot 表，减少维护成本。
- Block 仍然是文档内容单一事实来源，Board 只负责布局与关系。

## 约束与决策
- 历史 payload 不保存 blockId，只保存 blockSnapshotId。
- 恢复历史时，所有 Block 都会重新生成新 blockId。
- 不使用 hash；使用 Block.version 作为内容变更判断依据。

## 数据模型

### 当前态表
```prisma
model Board {
  id            String   @id @default(cuid())
  workspaceId   String
  pageId        String   @unique
  schemaVersion Int      @default(1)
  nodes         Json     // BoardNode[]
  connectors    Json     // BoardConnector[]
  viewport      Json     // { zoom, offset }
  version       Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  page Page? @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([workspaceId, updatedAt])
}

model Block {
  id        String   @id @default(cuid())
  type      String
  content   Json?
  props     Json?
  meta      Json?
  order     Float
  version   Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 历史表
```prisma
enum SnapshotTarget {
  page
  block
  board
}

model Snapshot {
  id          String         @id @default(cuid())
  workspaceId String
  targetType  SnapshotTarget
  targetId    String
  version     Int
  payload     Json
  groupId     String?
  createdAt   DateTime       @default(now())

  @@unique([targetType, targetId, version])
  @@index([workspaceId, createdAt])
  @@index([targetType, targetId, createdAt])
}
```

## JSON 结构

### BoardNode
```ts
type BoardNode = {
  id: string;
  kind: "block" | "node";
  blockId?: string;
  type?: string;
  xywh: [number, number, number, number];
  rotate?: number;
  zIndex?: number;
  opacity?: number;
  locked?: boolean;
  props?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};
```

### BoardConnector
```ts
type BoardConnector = {
  id: string;
  source:
    | { elementId: string; anchorId?: string }
    | { point: [number, number] };
  target:
    | { elementId: string; anchorId?: string }
    | { point: [number, number] };
  style?: string;
  zIndex?: number;
  props?: Record<string, unknown>;
};
```

### Snapshot Payload (Board)
```ts
type BoardSnapshotPayload = {
  nodes: Array<{
    id: string;
    kind: "block" | "node";
    blockSnapshotId?: string;
    type?: string;
    xywh: [number, number, number, number];
    rotate?: number;
    zIndex?: number;
    opacity?: number;
    locked?: boolean;
    props?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
  connectors: BoardConnector[];
  viewport: { zoom: number; offset: [number, number] };
};
```

### Snapshot Payload (Page)
```ts
type PageSnapshotPayload = {
  title?: string;
  icon?: string;
  cover?: string;
  markdown?: string | null;
  blocks: Array<{
    snapshotId: string;
    parentSnapshotId?: string;
    order: number;
  }>;
};
```

## 保存历史流程
1. 收集关联的 Block。
2. 对每个 Block 判断是否需要生成新 Snapshot：
   - 如果 Block.version 与上次记录一致，复用 latestSnapshotId。
   - 如果 Block.version 有变化，创建新的 block snapshot。
3. 创建 Board/Page snapshot：
   - payload 中只保存 blockSnapshotId，不保存 blockId。
4. 使用 groupId 把一次保存涉及的 board/page/block snapshots 关联成一组。

## 恢复历史流程（只读历史 -> 覆盖当前）
1. 读取 Board/Page snapshot payload。
2. 根据 blockSnapshotId 逐条创建新 Block（生成新 blockId）。
3. 用新 blockId 组装当前 Page/Board。
4. 删除旧 Block，避免遗留未引用数据。
5. 触发协作层重建文档状态（视 Yjs 集成策略执行）。

## 注意事项
- Board 当前态仍然使用 blockId；只有历史 payload 使用 blockSnapshotId。
- Block.version 必须在内容变更时递增，否则历史会错误复用。
- Page.markdownVersion 仅用于 Markdown 缓存刷新判断。
- Board.version 用于乐观锁或快速判断变更，可与 Snapshot.version 保持一致节奏。
