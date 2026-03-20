---
name: media-ops
description: AI 媒体生成与处理——图片生成、视频生成、图片编辑（缩放/裁剪/旋转/格式转换）、视频格式转换、音频提取、视频下载。当用户提到生成图片、画图、AI 画画、创建插画、设计海报、做视频、视频转码、提取音频、视频下载、图片处理、调整大小、裁剪、旋转、格式转换、"帮我画"、"生成一张"、"做个视频"、"下载这个视频"、"把图片转成 PNG"、"提取背景音乐"、"这个视频转 MP4"、resize、crop、blur、convert、generate image、create video 时激活。
---

# 媒体生成与处理

本 skill 覆盖所有媒体相关的 AI 工具：生成（image-generate、video-generate）、处理（image-process、video-convert）、下载（video-download）和模型查询（list-media-models）。

## 决策树

```
用户需要媒体操作
├── 生成全新内容？
│   ├── 图片 → image-generate
│   └── 视频 → video-generate
│   └── 不确定用什么模型？ → 先 list-media-models 查看可用模型
├── 处理已有文件？
│   ├── 图片（缩放/裁剪/旋转/格式转换/模糊/锐化/灰度） → image-process
│   ├── 视频格式转换 / 调整分辨率 → video-convert (action: convert)
│   └── 从视频提取音频 → video-convert (action: extract-audio)
├── 查看文件信息？
│   ├── 图片元数据（宽高/格式/DPI） → image-process (action: get-info)
│   └── 视频元数据（时长/分辨率/编码） → video-convert (action: get-info)
└── 下载网络视频？
    └── video-download
```

## 工具详情

### list-media-models — 查询可用媒体模型

在调用 image-generate 或 video-generate 之前，先查询可用模型列表以选择最合适的模型。

**参数**：
- `kind`：`"image"` 或 `"video"`

**返回**：模型列表，每个包含 id、name、tags、capabilities。

**tags 含义**：
- `image_generation` — 从文字生成新图片
- `image_edit` — 编辑/修改已有图片（换风格、局部修改）
- `image_multi_input` — 支持多张参考图输入
- `video_generation` — 从文字生成视频
- `image_analysis` — 图片理解/分析
- `video_analysis` — 视频理解/分析

**capabilities 字段**：
- `supportsMask` — 支持蒙版编辑
- `maxImages` — 最多输入图片数
- `supportsMulti` — 支持一次生成多张

### image-generate — AI 图片生成

通过云端 AI 模型生成图片。需要登录 OpenLoaf 云端账户。

**参数**：
- `prompt`（必填）：英文提示词，详细描述画面内容、风格、光线、构图。将用户的中文描述翻译并扩展为高质量英文提示词
- `negativePrompt`（可选）：英文负面提示词，描述不希望出现的元素
- `aspectRatio`（可选）：宽高比，如 `"1:1"`、`"16:9"`、`"9:16"`、`"4:3"`。默认 `"1:1"`
- `count`（可选）：生成数量，1-4 张，默认 1
- `fileName`（可选）：保存文件名（不含扩展名），多张自动添加 `_1`、`_2` 后缀
- `modelId`（可选）：指定模型 ID，建议先调用 list-media-models

**流程**：
1. 先 `list-media-models(kind: "image")` 了解可用模型
2. 将用户的中文描述翻译为详细的英文 prompt
3. 调用 `image-generate`，指定合适的 modelId
4. 前端自动展示生成结果（图片会保存到会话目录或画布资产目录）

**注意**：仅在用户明确要求生成图片时调用。用户只是讨论图片、分析已有图片时不要调用。

### video-generate — AI 视频生成

通过云端 AI 模型生成视频。需要登录 OpenLoaf 云端账户。

**参数**：
- `prompt`（必填）：英文提示词，详细描述画面内容、运动、风格
- `aspectRatio`（可选）：宽高比，如 `"16:9"`、`"9:16"`、`"1:1"`。默认 `"16:9"`
- `duration`（可选）：视频时长（秒），默认由模型决定
- `fileName`（可选）：保存文件名（不含扩展名）
- `modelId`（可选）：指定模型 ID，建议先调用 list-media-models

**注意**：仅在用户明确要求生成视频时调用。

### image-process — 图片处理

对已有图片进行变换操作。基于 sharp 库，支持多种图片格式。

**支持的输入格式**：jpeg/jpg, png, webp, avif, tiff, gif, bmp, svg, heif/heic

**action 列表**：

| action | 必填参数 | 说明 |
|--------|---------|------|
| `get-info` | 无 | 返回宽高、格式、色彩空间、通道数、DPI、文件大小等元数据 |
| `resize` | `width` 和/或 `height` | 缩放。可选 `fit`（cover/contain/fill/inside/outside） |
| `crop` | `left`, `top`, `cropWidth`, `cropHeight` | 裁剪指定矩形区域 |
| `rotate` | 可选 `angle`（默认 90°） | 顺时针旋转 |
| `flip` | 可选 `direction`（horizontal/vertical） | 翻转，默认垂直 |
| `grayscale` | 无 | 灰度化 |
| `blur` | 可选 `sigma`（0.3-100，默认 3） | 高斯模糊 |
| `sharpen` | 无 | 锐化 |
| `tint` | `tintColor`（如 `"#FF6600"`） | 着色 |
| `convert` | `format` + `outputPath` | 格式转换。可选 `quality`（1-100，默认 80） |

**输出路径**：未指定 `outputPath` 时自动在源文件名后添加操作后缀（如 `photo_resize.png`），不覆盖原图。设置 `overwrite=true` 可覆盖。

**限制**：gif 仅处理第一帧；svg 仅支持作为输入；png 转 jpeg 时透明区域变白底。

### video-convert — 视频/音频格式转换

基于 FFmpeg 实现，依赖系统安装 FFmpeg。

**action 列表**：

| action | 必填参数 | 说明 |
|--------|---------|------|
| `get-info` | 无 | 返回时长、分辨率、编解码器、流信息 |
| `convert` | `outputPath` | 视频格式转换。可选 `format`（mp4/avi/mkv/mov/webm）、`resolution`（如 `"1280x720"`） |
| `extract-audio` | `outputPath` | 从视频提取音频。可选 `audioFormat`（mp3/aac/wav/flac/ogg，默认 mp3） |

**支持格式**：视频 mp4/avi/mkv/mov/webm/flv/wmv/m4v，音频 mp3/wav/aac/flac/ogg。

**注意**：未安装 FFmpeg 时会返回安装指引（macOS: `brew install ffmpeg`）。

### video-download — 视频下载

通过服务端 yt-dlp 从公开视频网址下载视频。

**参数**：
- `url`（必填）：视频网址（包含 http:// 或 https://）

**返回**：`{ ok, data: { url, destination, fileName, filePath, absolutePath, fileSize, title, duration, width, height, ext } }`

**保存位置**：画布上下文保存到画布 asset 目录，否则保存到当前会话 chat-history/asset 目录。

**不适用**：需要 AI 生成全新视频时用 video-generate；需要转换本地视频时用 video-convert。

## 常见工作流

### 生成并处理图片
1. `list-media-models(kind: "image")` 选模型
2. `image-generate(prompt: "...", modelId: "...")` 生成
3. 如需后续处理：`image-process(action: "resize", filePath: "...", width: 800)`

### 视频下载+提取音频
1. `video-download(url: "https://...")` 下载
2. `video-convert(action: "extract-audio", filePath: "...", outputPath: "output.mp3")`

### 批量图片格式转换
对每张图片调用 `image-process(action: "convert", filePath: "...", format: "webp", outputPath: "...")`
