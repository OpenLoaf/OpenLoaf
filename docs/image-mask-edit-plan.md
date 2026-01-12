# ImageViewer 图片调整（Mask）方案

## 背景与目标

基于现有 `ImageViewer` + ChatInput 附件链路，实现“涂抹生成 mask 并用于图像编辑”的完整流程：

- ImageViewer 进入“AI调整”模式后启用半透明笔刷涂抹。
- 顶部按钮切换为“完成”，完成后将图像加入 ChatInput 附件列表。
- 附件列表仅显示**一张**涂抹后的预览图（带半透明痕迹），但发送时携带**原图 + mask**。
- 只允许存在**一张**带 mask 的附件；新 mask 生成时替换旧的。
- 当当前模式无 `image_mesk_input` 标签模型时提示不可用。
- 保存后将模型切换到当前模式下第一个带 `image_mesk_input` 的模型。

> 关键调整：不再写入原文件路径；统一走 ChatInput 的上传逻辑（`/chat/attachments`），让后端生成新的 `tenas-file://`。

---

## 现有实现触点（已核对）

- `apps/web/src/components/file/ImageViewer.tsx`
  - 图片预览与保存。
  - `react-zoom-pan-pinch` 负责缩放/平移。
- `apps/web/src/components/chat/Chat.tsx`
  - 附件状态、上传 `/chat/attachments`。
- `apps/web/src/components/chat/ChatInput.tsx`
  - 构造 message.parts（file + text）。
- `apps/web/src/components/chat/file/ChatImageAttachments.tsx`
  - 附件列表展示。
- `apps/server/src/ai/chat-stream/chatStreamService.ts`
  - `runImageModelStream` 当前只用纯文本 prompt。
- 适配器：
  - `apps/server/src/ai/models/volcengine/volcengineImageModel.ts` 支持 mask。
  - OpenAI/AI SDK 支持 `prompt: { text, images, mask }`。

---

## 前端方案

### 1) 数据结构扩展（ChatAttachment）

建议扩展附件结构以容纳 mask 与预览叠加：

```ts
type ChatAttachment = {
  id: string;
  file: File;
  objectUrl: string;
  remoteUrl?: string;
  mediaType?: string;
  status: ChatAttachmentStatus;
  errorMessage?: string;
  // 新增：mask（不作为独立附件展示）
  mask?: {
    file: File;
    objectUrl: string;
    remoteUrl?: string;
    mediaType?: string;
    status: ChatAttachmentStatus;
  };
  // 新增：附件列表显示用预览叠加图
  overlayObjectUrl?: string;
  // 新增：标识
  hasMask?: boolean;
};
```

设计意图：
- mask 作为 `attachment.mask` 内嵌，避免附件列表出现 2 张图。
- `overlayObjectUrl` 让列表显示“涂抹痕迹”。
- `hasMask` 用于 UI 标识与发送逻辑判断。

### 2) ChatProvider 注入“可选附件追加”能力

- 新增 `addMaskedAttachment` 方法（或等价命名），用于 ImageViewer 把“原图 + mask + overlay”插入附件列表。
- 增加 `useOptionalChatContext`，允许 ImageViewer 在非聊天场景中调用时不报错。

### 3) ImageViewer 调整模式交互

**模型可用性检查**：
- 先检查是否已配置 S3/对象存储（前端可用配置源则直接判断；否则调用轻量接口探测）。
- 未配置时：`toast.error("需要配置 S3 存储服务")` 并返回。
- 基于 `basic.chatSource` 用 `buildChatModelOptions` 构造当前模式可用模型。
- 过滤 `tags.includes("image_mesk_input")`。
- 如果为空：`toast.error("没有可用的图片调整模型，请添加或者使用云端模型")` 并返回。
- 如果存在：记录首个模型 id（完成时切换）。

**涂抹模式 UI**：
- 叠加两层 canvas：
  - overlayCanvas：半透明笔刷痕迹（可视层）。
  - maskCanvas：黑底 + 白色涂抹（内存层，用于最终 mask）。
- 绘制坐标按图片显示尺寸映射到自然尺寸，保证 mask 尺寸一致。
- 默认笔刷颜色用于 overlay，opacity 约 0.3~0.4；背景保持原图可见。

**禁用缩放/平移**：
- 调整模式下关闭 `TransformWrapper` 的 `panning/wheel/pinch/doubleClick`。
- `minScale = maxScale = fitScale`，避免缩放干扰绘制。

**完成按钮逻辑**：
- 若未涂抹（`hasStroke=false`）：只生成原图附件。
- 若已涂抹：生成 mask PNG（单通道灰度，0=黑，255=白），并生成 overlay 预览图。
- 调用 `addMaskedAttachment`：插入原图 + mask，并保存 overlay 作为显示图。
- 设置 `basic.modelDefaultChatModelId = firstMaskModelId`。

**非 Chat 场景**：
- 若不在 ChatProvider 内，建议 toast 提示“仅聊天中可用”。

---

## 附件上传与发送（前端）

### 上传逻辑（Chat.tsx）

- 保持原有 `uploadAttachment`。
- 若存在 `attachment.mask`：新增 `uploadMaskAttachment`，将 mask 上传到 `/chat/attachments`，并写入 `mask.remoteUrl`。
- `hasPendingAttachments` 需同时检查 `mask.status`。
- 仅允许单个 masked 附件：在 `addMaskedAttachment` 内清理旧的 masked 记录。

### 发送逻辑（ChatInput.tsx）

发送时构造 parts：

- 原图：`{ type: "file", url, mediaType }`
- mask：`{ type: "file", url, mediaType, purpose: "mask" }`

这样服务端能识别 mask，不需新增 part 类型。

### 附件列表展示（ChatImageAttachments.tsx）

- 若 `hasMask` 为 true，缩略图使用 `overlayObjectUrl` 显示涂抹痕迹。
- 标记显示 “已调整” 或 “MASK”。
- 列表中只允许存在一个 `hasMask` 附件，新添加时替换旧的并释放旧 objectUrl。

---

## 服务端方案（runImageModelStream）

### 1) Prompt 类型升级

将 prompt 升级为：

```ts
type GenerateImagePrompt =
  | string
  | {
      text?: string;
      images: Array<DataContent>;
      mask?: DataContent;
    };
```

该结构与 AI SDK 的 `generateImage` prompt 示例保持一致。

### 2) 解析规则

新增 `resolveImagePrompt` 逻辑：

- 取最后一条 user message。
- text parts -> `text`。
- file parts -> `images`。
- file parts with `purpose="mask"` -> `mask`。
- 若存在 images/mask，返回对象；否则返回文本字符串。

### 3) DataContent 生成策略

新增统一转换函数（服务端）：

- `tenas-file://`：读取二进制，生成 `Uint8Array`。
- `data:`：解析 base64 -> `Uint8Array`。
- `http(s)`：视为 URL。

**图像编辑时统一 URL**：

- mask 需要二次转换（alpha/grey），转换后写入临时对象存储并返回 URL。
- 原图也一并上传到同一存储，保证 **模型输入全部为 URL**，避免 Volcengine 的混用限制。
- 若未配置 S3（或其他可公开访问的存储），直接返回错误提示；前端点击“AI调整”时也需要阻止并提示配置。

### 4) Mask 转换与命名规则（服务端）

根据模型类型生成不同的 mask 文件：

- OpenAI：生成 `{原图名}_alpha.png`  
  - PNG + alpha 通道  
  - 透明区域 = 重绘区域  
  - 转换方式：`alpha = 255 - maskGray`（白色涂抹 -> 透明）
- 即梦/Volcengine：生成 `{原图名}_grey.png`  
  - 单通道灰度  
  - 黑色保留，白色重绘  

转换实现建议：

- 使用原图尺寸作为基准（确保“通过原图+mask”生成目标 mask）。
- `sharp` 读取 mask（灰度）并对齐原图尺寸。
- `alpha` 版本通过 `maskGray` 反相生成 alpha 通道，再合成 RGBA。
- 生成后的 mask 与原图一并上传到 S3，得到 URL。

### 5) Mask 格式选择（服务端）

新增 `resolveMaskFormatByModel`：

- `providerId === "openai"` 或 `openai-compatible`：强制 `alpha`。
- `providerId === "volcengine"`：强制 `grey`。
- 其他 provider：默认 `grey`（后续按适配器能力扩展）。

若 `modelDefinition` 缺失，可用 `chatModelId` 前缀或 adapter id 进行兜底判断。

### 4) 必要的能力标签

当 message parts 含 mask 时，`resolveRequiredInputTags` 应补充 `image_mesk_input`，用于 Auto 选模时约束。

---

## 适配器兼容性

### OpenAI / AI SDK

AI SDK 支持：

```ts
prompt: {
  text: "...",
  images: [imageUrl],
  mask: maskUrl
}
```

按需求统一走 URL 输入：

- 原图上传后获得 URL。
- mask 强制转成 `{原图名}_alpha.png` 并上传后获得 URL。
- 透明区域即重绘区域（white -> transparent）。

### Volcengine

- `jimeng_image2image_dream_inpaint` 必须提供原图 + mask。
- 支持 URL 或 base64，但不可混用。
- 统一使用 URL，mask 强制转 `{原图名}_grey.png`，灰度规则与文档一致。

---

## 文件路径变化链（统一理解）

1. ImageViewer 显示：`data:` / `tenas-file://` / `file://`
2. ImageViewer 生成 File -> ChatInput 上传 `/chat/attachments`
3. 服务端保存：`tenas-file://.../.tenas/chat/{sessionId}/{hash}.{ext}`
4. 模型调用（图像编辑场景）：  
   - 生成 `{原图名}_alpha.png` 或 `{原图名}_grey.png`  
   - 原图 + mask 上传到 S3，获得 URL  
   - 使用 URL 调用模型  
5. SSE 输出：data URL -> 落盘 -> `tenas-file://`

---

## 流程图

```text
[ImageViewer显示图片]
        |
        v
  点击“AI调整”
        |
        v
  检查 image_mesk_input 模型
    |        |
    |无      |有
    v        v
 toast     进入涂抹模式
              |
              v
         画笔涂抹(overlay+mask)
              |
              v
           点击“完成”
           |          |
           |无涂抹     |有涂抹
           v          v
       只加原图     生成 mask + overlay
           |          |
           v          v
   Chat附件上传(原图)  Chat附件上传(原图+mask)
           |          |
           v          v
    附件列表显示       附件列表显示(单张+涂抹)
           |          |
           +----------+
                     v
               用户点击发送
                     |
                     v
          SSE 请求 (parts: image + mask)
                     |
                     v
        runImageModelStream 解析 prompt
                     |
                     v
        生成 mask(alpha/grey) + 原图
                     |
                     v
           上传 S3 获取 URL
                     |
                     v
               调用 ImageModel
                     |
                     v
           SSE 返回图片 -> 落盘 -> tenas-file
```

---

## 实施步骤（落地顺序）

1. 扩展 `ChatAttachment` 结构。
2. `ChatProvider` 注入 `addMaskedAttachment` 与 `useOptionalChatContext`。
3. `ImageViewer` 增加涂抹模式、模型检查、完成后插入附件逻辑。
4. `Chat.tsx` 支持 mask 上传与“仅一个 masked 附件”。
5. `ChatImageAttachments.tsx` 支持 overlay 预览与 mask 标识。
6. `ChatInput.tsx` 构造 parts 时加入 `purpose: "mask"`。
7. `chatStreamService.ts` 支持 prompt.images + prompt.mask。
8. 适配器层完善 mask 数据形态（OpenAI alpha / Volcengine grey + URL）。

---

## 待确认问题

- 非 Chat 场景下是否允许进入 AI 调整？
