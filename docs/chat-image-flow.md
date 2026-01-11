# Chat 图片处理流程（tenas-file）

## 目标

- 上传/生成的图片只落盘压缩结果，数据库只保存 `tenas-file://` 引用。
- SSE 输出保持 data URL，前端展示逻辑不变。
- 服务端调用模型前将 `tenas-file` 解析为 `file` part，并做二次压缩。
- 改写提示词以 `data-revised-prompt` 形式追加在图片之后。

## 数据结构约定

- `tenas-file://{ownerId}/.tenas/chat/{sessionId}/{hash}.{ext}`
- `parts` 使用 `file` 类型，`url` 指向 `tenas-file`：
  - `{ type: "file", url: "tenas-file://w1/.tenas/chat/s1/abcd.png", mediaType: "image/png" }`
- `ownerId` 优先使用 `projectId`，否则使用 `workspaceId`。
- SSE 中 `file` part 为 `data:{mime};base64,...`。

## 关键流程（MVP）

### 1) 上传阶段（ChatInput 拖入图片）

- 前端调用 `/chat/attachments` 上传文件（`workspaceId` + `sessionId`，`projectId` 可选）。
- 若是 `tenas-file://`，服务端读取源文件后压缩转码并写入 `.tenas/chat/{sessionId}/{hash}.{ext}`。
- 若是二进制上传，服务端压缩并写入 `.tenas/chat/{sessionId}/{hash}.{ext}`。
- 返回 `tenas-file://` URL 给前端。

### 2) 发送阶段（用户点击发送）

- 前端将 `tenas-file` URL 写入 `parts`（`type: "file"`）。
- SSE 请求发送包含 `tenas-file` 的 `parts` 给服务端。

### 3) 模型调用阶段（服务端准备请求）

- 读取历史消息链。
- 将 `tenas-file` 转为 `file` part（data URL）。
- 按规则再次压缩以控制输入尺寸。
- 调用模型。

### 4) 图片生成阶段（image_output）

- 显式模型命中且 tags 包含 `image_output` 时走图片流。
- 通过 `generateImage` 获取图片。
- SSE 输出 `file` chunk（data URL）。
- 同时将图片保存到 `.tenas/chat/...`，落库 `parts` 使用 `tenas-file://`。
- 若存在改写提示词，追加 `data-revised-prompt`（在图片之后）。

### 5) 历史消息再次发送

- 历史里的 `tenas-file` 重新解析为 data URL 后再发给模型。

## 流程图

```text
上传图片 -> /chat/attachments -> 压缩+落盘 -> tenas-file URL
    |
    v
SSE 请求 -> 解析历史 -> tenas-file 转 data URL -> 调用模型
    |
    +-- text 输出 -> SSE
    |
    +-- image_output -> generateImage -> SSE 输出 data URL
                           |
                           +-> 保存到 .tenas/chat -> 落库 tenas-file
                           +-> data-revised-prompt (可选)
```

## 压缩策略建议

- 分辨率：最长边 <= 1024
- 格式：保留原格式；必要时转 JPEG/WEBP
- 质量：根据格式设置合理区间（例如 JPEG 75~85）
