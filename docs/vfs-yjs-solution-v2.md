# 项目文件系统化 + Yjs 协作（文件为真）方案 v2

## 目标与约束
- 不使用数据库保存任何项目/内容/协作数据，全部落到文件系统。
- Project 以文件夹为根，单 root。
- Project 配置与 intro 也存文件（随项目移动/拷贝）。
- 默认存储路径：workspace 配置根目录下，每个 Project 一个文件夹。
- 内容搜索默认仅当前 Project root。
- 协作采用 Yjs，多人实时同步。
- 浏览器侧用 IndexedDB 作为缓存。
- 支持 URI 超链接关联（跨本地/远端/容器/WSL 等）。

## 关键决策
- **统一资源标识**：使用 URI（`file://` / `teatime-remote://`）。
- **文件系统为唯一真相**：协作状态、文档内容、项目配置均可仅凭文件恢复。
- **Yjs 持久化纯文件化**：
  - 文档快照写回文件本体（`*.ttdoc/*.ttcanvas/*.ttskill`）。
  - 增量写入 WAL（`.teatime/yjs/<fileId>.wal`），仅作为可靠性与性能加速。
- **fileId 写在文件头**：移动/改名不丢协作链路。

## Project 结构与发现（v2 规则）
### 目录结构示意（含附件）
```
<workspaceRoot>/
  <projectRoot>/
    .teatime/
      project.json
      yjs/
        <fileId>.wal
        <fileId>.lock
      index/
        <fileId>.txt
    sub-project-a/
      .teatime/
        project.json
    docs/
      demo.ttdoc
      demo.ttdoc.teatime/
        2f6c.png
```

### project.json（项目索引）
```json
{
  "schema": 2,
  "projectId": "proj_xxx",
  "title": "Demo",
  "intro": { "kind": "resource", "targetId": "file://...", "component": "canvas", "pageType": "canvas" },
  "childrenIds": ["sub-project-a", "sub-project-b"]
}
```

### Project Root 计算规则
1) 以 `apps/server/teatime.conf` 中激活 workspace 的 `projects` 映射为准。  
2) `projects` 结构为 `{ [projectId]: "file://..." }`，值即项目 rootUri。  
3) projectId 在 rootUri 下的 `.teatime/project.json` 内声明（用于显示信息）。  
4) `childrenIds` 仍用于递归构建子项目树（子项目目录名）。  
5) 不再使用 `.teatime/<projectId>.ttid` 标记文件。  

workspaceRootUri 已下放为 `workspaces[].rootUri`。

## 文件系统（VFS）设计
统一接口（按 scheme 分发）：
- `stat(uri)`
- `list(uri)`
- `readFile(uri)`
- `writeFile(uri, content)`
- `mkdir(uri)`
- `rename(from, to)`
- `delete(uri)`
- `watch(uri, onChange)`
- `search(uri, query, options)`

## 自定义文件格式（文件为真）
可协作文件：
```
*.ttdoc / *.ttcanvas / *.ttskill
```

文件本体为 JSON，包含快照（可脱离任何数据库恢复）：
```json
{
  "schema": 1,
  "fileId": "01J8E6H2QZ8Y3E8N9W8Z0F5A7G",
  "type": "ttdoc",
  "title": "文稿标题",
  "snapshot": "base64(yjs-doc)",
  "assets": {
    "img_1": { "path": "./demo.ttdoc.teatime/2f6c.png", "mime": "image/png" },
    "video_1": { "path": "./demo.ttdoc.teatime/83a1.mp4", "mime": "video/mp4" }
  },
  "searchText": "用于全文检索的纯文本"
}
```

### 资源与附件存储规则
- 附件与二进制资源存放在同名目录：`<file>.ttdoc.teatime/`。
- 资源目录后缀固定为 `.teatime`，与文件同级，不做嵌套分组。
- JSON 内部使用相对路径引用，保证移动/拷贝项目不丢资源。
- 文件名建议使用 hash/uuid，避免重名冲突并支持去重。
- 重命名文件时同步重命名资源目录，删除文件时同步删除资源目录。
- 复制文件时复制一份资源目录，避免共享导致误删。

## Yjs 协作与持久化流程（纯文件）
### 打开文件
1) 读取 `*.ttdoc` 文件，解析 `snapshot` 与 `fileId`。  
2) 若存在 `.teatime/yjs/<fileId>.wal`，依次回放增量。  
3) 合并生成 Yjs Doc，加入 WS 协作。  

### 编辑中
- 客户端产生 update → WS → server 广播。
- server 追加写入 WAL（`.teatime/yjs/<fileId>.wal`）。
- 客户端写入 IndexedDB（缓存/离线）。

### 快照与 GC
- 触发条件：更新数量/体积阈值或定时。
- 合并：`snapshot + wal → 新 snapshot`，回写到文件本体。
- 写入采用 `tmp + rename`，保证原子性。
- 成功后清空 WAL。
- `searchText` 在每次快照合并时重建并写回文件本体。

### WAL 格式与截断策略
- WAL 为追加写文件，内容是 Yjs update 的二进制字节序列。
- WAL 只保存二进制更新，不额外存 JSON 结构。
- 建议具备可恢复结构：文件头 + 追加帧。
- 帧结构建议包含 `length + type + payload + crc`，便于检测尾部半写入。
- 截断触发条件：体积/条数/时间阈值（如 5MB / 500 updates / 30min）。
- 截断流程：`snapshot + wal → 新 snapshot`，用 `tmp + rename` 原子替换文件本体，成功后清空 WAL。

## 关键注意点
- 项目树由 `project.json` 的 `children` 决定，子项目名称即**下一级目录名**。
- `.teatime/` 目录对用户默认隐藏，但不可被忽略（含项目配置与 WAL）。
- 文档附件目录为 `<file>.teatime/`，与项目级 `.teatime/` 是不同概念。
- `fileId` 必须稳定且只存在于可协作文档。
