---
name: media-ops-skill
description: >
  处理本地已有的图片 / 视频 / 音频文件，或下载网络视频。图片：缩放、裁剪、旋转、格式转换（→webp/png/jpeg）、滤镜、查看尺寸；视频：格式转换、提取音频、查看元信息；下载：YouTube / B 站等公开视频。也用于 AI 生成图片后的二次处理（转格式、缩放）。**不用于**：AI 从零生成图片/视频/语音（→cloud-media-skill）、在对话里渲染图表（→visualization-ops-skill）。
tools: [ImageProcess, VideoConvert, VideoDownload]
---

# 图片 / 视频 / 音频处理

本 skill 覆盖三个本地媒体工具，**图片处理是核心能力**。

> **⚡ 读到此处立刻行动** — 不要停下来回复用户。紧接着执行 `ToolSearch(names: "ImageProcess")` 激活工具 schema，然后调用 `ImageProcess` 完成操作。**这三步必须在同一个 response 内完成。**

## 工具清单

| 工具 | 职责 |
|------|------|
| `ImageProcess` | 图片处理：缩放 / 裁剪 / 旋转 / 翻转 / 格式转换 / 灰度 / 模糊 / 锐化 / 着色 / 查看元信息 |
| `VideoConvert` | 视频格式转换 / 提取音频 / 查看元信息 |
| `VideoDownload` | 从 YouTube / B 站等公开网址下载视频 |

> **加载**：全部为 deferred 工具，调用前须先 `ToolSearch(names: "ImageProcess,VideoConvert,VideoDownload")` 激活 schema。

## 决策树

```text
用户需要媒体操作
├── 处理图片？（缩放 / 裁剪 / 旋转 / 转格式 / 滤镜 / 查看尺寸）
│   └── ImageProcess
├── 处理视频？
│   ├── 格式转换 / 调整分辨率 → VideoConvert (action: convert)
│   └── 提取音频 → VideoConvert (action: extract-audio)
├── 查看文件信息？
│   ├── 图片（宽高 / 格式 / DPI） → ImageProcess (action: get-info)
│   └── 视频（时长 / 分辨率 / 编码） → VideoConvert (action: get-info)
└── 下载网络视频？
    └── VideoDownload
```

## ImageProcess — 图片处理

基于 sharp，对已有图片进行变换。**AI 生成的图片同样适用**。

| action | 用途 | 关键参数 |
|--------|------|---------|
| `get-info` | 读取宽高、格式、DPI、文件大小 | 仅 filePath |
| `resize` | 缩放 | `width`/`height`/`fit` |
| `crop` | 矩形裁剪 | `left`/`top`/`width`/`height` |
| `rotate` | 旋转 | `angle` |
| `flip` | 翻转 | `direction` |
| `convert` | 格式转换 | `format`（png/jpeg/webp/avif/tiff） |
| `grayscale`/`blur`/`sharpen`/`tint` | 滤镜效果 | 各有专属参数 |

**处理前先 get-info**：了解原始尺寸和格式，避免盲目操作——比如用户说"缩小一半"，你需要知道原始宽高才能计算目标值。

**输出路径决策**：默认追加后缀（如 `photo_resized.jpg`）。直接覆盖原文件有风险——用户可能需要原图作对比或回退。用户明确要求覆盖时除外。

## VideoConvert — 视频/音频转换

基于 FFmpeg，处理已有文件的格式转换和音频提取。

| action | 用途 | 关键参数 |
|--------|------|---------|
| `get-info` | 读取时长、分辨率、编解码器、流信息 | 仅 filePath |
| `convert` | 视频格式转换 | `format`、`resolution` |
| `extract-audio` | 从视频提取音频 | `audioFormat`（mp3/wav/aac/flac） |

**格式选择建议**：
- 通用兼容：MP4（H.264）——几乎所有设备都能播放
- 高质量压缩：WebM（VP9）——文件更小但兼容性略差
- 音频提取：MP3（通用）、FLAC（无损）

**大文件注意**：视频转码耗时与文件大小成正比。超过 500MB 的文件转换可能需要较长时间，提前告知用户预期等待。

## VideoDownload — 视频下载

通过 yt-dlp 下载公开视频 URL。

**适用**：用户给出公开视频链接，需要下载到本地继续处理（编辑、提取音频、转码）。

**不适用**：
- 生成新视频 → cloud-media-skill
- 转换本地已有视频 → `VideoConvert`
- 私有/需登录的视频 → 告知用户 yt-dlp 只能下载公开内容

**下载后常见后续**：下载完成后用户通常需要进一步处理——提取音频、转换格式、裁剪。主动询问是否需要后续操作。

## 常见工作流

### AI 生成图片后转格式 / 缩放

```
CloudImageGenerate(…) → 拿到 absolutePath
ImageProcess(action: "get-info", filePath: "…")   # 先确认原始尺寸
ImageProcess(action: "convert", filePath: "…", format: "webp", outputPath: "…")
```

### 视频下载 → 提取音频

```
VideoDownload(url: "...") → 拿到 filePath
VideoConvert(action: "extract-audio", filePath: "...", outputPath: "output.mp3")
```

### 批量图片格式转换

对每张图片调用 `ImageProcess(action: "convert", format: "webp")`。WebP 格式在保持画质的同时文件体积约为 JPEG 的 70%，适合 Web 使用场景。

## 常见错误

**格式不支持** → 检查文件扩展名和实际编码是否匹配。用户可能把 `.mp4` 文件命名为 `.avi`，先用 `get-info` 确认真实格式。

**输出文件与输入同路径** → 部分操作不支持原地覆盖。用不同的 outputPath，完成后如需替换再通知用户。

**用户说"压缩图片"含义模糊** → 可能指：缩小尺寸（resize）、降低质量（convert 时调 quality）、或换格式（jpeg→webp）。主动澄清意图。
