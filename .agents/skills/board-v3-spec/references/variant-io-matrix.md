# Variant IO 矩阵速查表

> 每个 variant 的精确输入输出契约。开发时必须对照。

## Image Variants

| ID | Component | isApplicable | inputs | params | mask | count | seed |
|----|-----------|-------------|--------|--------|------|-------|------|
| OL-IG-001 | ImgGenTextVariant | !nodeHasImage | prompt, image? | negativePrompt?, aspectRatio, quality | - | Y | - |
| OL-IG-002 | ImgGenTextVariant | !nodeHasImage | prompt, image? | aspectRatio, quality | - | - | - |
| OL-IG-003 | ImgGenTextVariant | !nodeHasImage | prompt, image? | negativePrompt?, aspectRatio, quality | - | - | - |
| OL-IG-004 | ImgGenTextVariant | !nodeHasImage | prompt, image? | negativePrompt?, aspectRatio, quality | - | Y | - |
| OL-IG-005 | ImgGenRefVariant | always | prompt, images[] | style?, aspectRatio, quality | - | Y | - |
| OL-IG-006 | ImgGenRefVariant | always | prompt, images[] | style?, aspectRatio, quality | - | Y | - |
| OL-IE-001 | ImgEditWanVariant | always | prompt, images[] | enable_interleave, negativePrompt? | - | - | - |
| OL-IE-002 | ImgEditPlusVariant | hasImage | prompt, images[] | negativePrompt? | Panel注入 | - | - |
| OL-IP-001 | ImgInpaintVolcVariant | hasImage | image | prompt (in params) | Panel注入,必填 | - | Y |
| OL-ST-001 | ImgStyleVolcVariant | hasImage | image | prompt?, aspectRatio?, quality? | - | - | - |
| OL-UP-001 | UpscaleQwenVariant | hasImage | image | scale(2/4) | - | - | - |
| OL-UP-002 | UpscaleVolcVariant | hasImage | image | scale(2/4) | - | - | - |
| OL-OP-001 | OutpaintQwenVariant | hasImage | image, prompt? | xScale, yScale | - | - | - |

## Video Variants

| ID | Component | isApplicable | inputs | params |
|----|-----------|-------------|--------|--------|
| OL-VG-001 | VidGenQwenVariant | hasImage | startImage, prompt | style?, duration, withAudio |
| OL-VG-002 | VidGenQwenVariant | hasImage | startImage, prompt | style?, duration, withAudio |
| OL-VG-003 | VidGenVolcVariant | always | startImage?, prompt, images[]? | style?, aspectRatio?, duration |
| OL-LS-001 | LipSyncVolcVariant | hasImage && hasAudio | person, audio | (none) |

## Audio Variants

| ID | Component | isApplicable | inputs | params |
|----|-----------|-------------|--------|--------|
| OL-TT-001 | TtsQwenVariant | always | text | voice?, format?, speechRate?, pitchRate?, volume? |

## FIELD_CONFIG (ImgGenTextVariant 内部)

| Variant ID | showNegative | showCount |
|-----------|-------------|----------|
| OL-IG-001 | true | true |
| OL-IG-002 | false | false |
| OL-IG-003 | true | false |
| OL-IG-004 | true | false |

## MediaInput 格式

```typescript
// toMediaInput(src) 输出:
{ path: "asset/xxx.jpg" }   // board-relative path
{ url: "https://..." }      // 公网 URL
{ url: "data:..." }         // data URL (会被 resolveAllMediaInputs 上传)

// API 最终接受:
{ url: "https://..." }      // 所有 path/data 都已上传为公网 URL
```

## 返回模式

| 模式 | Variants | 说明 |
|------|----------|------|
| sync | OL-IG-001~006, OL-IE-001~002 | 直接返回结果 |
| async | OL-IP-001, OL-ST-001, OL-UP-001~002, OL-OP-001, OL-VG-001~003, OL-LS-001 | 需轮询 taskId |
| syncBinary | OL-TT-001 | 直接返回音频二进制 |
