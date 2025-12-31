# Chat 图片处理流程（teatime-file）

## 目标

- 图片在上传阶段直接做分辨率限制与质量压缩，不保存原图。
- 前端发送消息时携带 `teatime-file://` 资源引用。
- 服务端在转发给模型前，将 `teatime-file` 解析为 `file` part，并按需再次压缩。
- 暂不支持公网 URL（后续接入 S3 再扩展）。

## 数据结构约定

- `teatime-file://{projectId}/.teatime/chat/{sessionId}/{hash}.{ext}`
- `parts` 新增类型：`teatime-file`
  - 示例：
    - `{ type: "teatime-file", url: "teatime-file://p1/.teatime/chat/s1/abcd.png", mediaType: "image/png" }`

## 关键流程（MVP）

### 1) 上传阶段（ChatInput 拖入图片）

- 前端读取图片 -> 调用上传接口。
- 服务端写入路径：`.teatime/chat/{sessionId}/{hash}.{ext}`（按 projectId 分区）。
- 写入前执行分辨率限制与质量压缩。
- 返回 `teatime-file://{projectId}/.teatime/chat/{sessionId}/{hash}.{ext}` 给前端。

### 2) 发送阶段（用户点击发送）

- 前端将 `teatime-file` URL 写入 `parts`。
- SSE 请求发送包含 `teatime-file` 的 `parts` 给服务端。

### 3) 模型调用阶段（服务端准备请求）

- 解析历史消息中的 `teatime-file` parts。
- 根据 `teatime-file://` 读取压缩后的文件。
- 若为图片，按规则再次压缩（可选二次限制，以防极端情况）。
- 将 `teatime-file` 替换成 `file` part（data URL 或 buffer）。
- 调用模型。

### 4) 历史消息再次发送

- 每次请求都需要把历史里的图片重新转成 `file` part 并发送。
- 原因：模型只感知当前请求输入，不记住上次图片内容。

## 流程图

```text
用户拖入图片
    |
    v
前端读取图片 --> 上传接口
    |                 |
    |                 v
    |        服务器压缩+写入
    |                 |
    |                 v
    |        返回 teatime-file URL
    |                 |
    v                 v
前端缓存 URL --- 用户点击发送
    |
    v
SSE 发送（parts 含 teatime-file）
    |
    v
服务端解析历史 messages
    |
    v
读取 teatime-file -> 压缩 -> 替换为 file part
    |
    v
发送给模型
```

## 压缩策略建议

- 分辨率：最长边 <= 1024
- 格式：优先保留原格式；如需统一可转为 JPEG/WEBP
- 质量：根据格式设置合理区间（例如 JPEG 75~85）

## 备注

- 后续接入 S3 后，将直接改为 AI SDK 标准图片输入流程，不再走 `teatime-file` 方案。
