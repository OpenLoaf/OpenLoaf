---
name: media-ops
description: 媒体处理与下载——图片编辑（缩放、裁剪、旋转、格式转换）、视频格式转换、音频提取、视频下载。当用户提到视频下载、图片处理、调整大小、裁剪、旋转、格式转换、提取音频、视频转码、"下载这个视频"、"把图片转成 PNG"、"提取背景音乐"、"这个视频转 MP4"、resize、crop、blur、convert 时激活。AI 图片/视频生成已迁移到画布 v3 流程，不再由 server agent 直接提供。
---

# 媒体处理与下载

本 skill 仅覆盖 server agent 仍然直接提供的媒体能力：

- `image-process`
- `video-convert`
- `video-download`

## 决策树

```text
用户需要媒体操作
├── 生成全新内容？
│   └── 引导到画布 v3 媒体生成流程（server agent 不直接生成）
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

### image-process — 图片处理

对已有图片进行变换操作。基于 sharp，适合缩放、裁剪、旋转、模糊、锐化、灰度化、着色与格式转换。

常用 action：

- `get-info`：读取宽高、格式、DPI、文件大小等元数据
- `resize`：缩放图片，可带 `width` / `height` / `fit`
- `crop`：按矩形区域裁剪
- `rotate`：旋转
- `flip`：翻转
- `grayscale` / `blur` / `sharpen` / `tint`
- `convert`：格式转换

### video-convert — 视频/音频转换

基于 FFmpeg，适合已有文件的格式转换、提取音频与读取媒体信息。

常用 action：

- `get-info`：读取时长、分辨率、编解码器、流信息
- `convert`：转换视频格式，可选 `format`、`resolution`
- `extract-audio`：从视频提取音频，可选 `audioFormat`

### video-download — 视频下载

通过服务端 yt-dlp 下载公开视频网址对应的媒体文件。

适用场景：

- 用户明确给出公开视频链接，希望下载到当前会话或画布资源目录
- 下载完成后还要继续做音频提取、转码、裁剪等后处理

不适用：

- 需要 AI 生成全新视频时，引导到画布 v3 媒体生成流程
- 需要转换本地已有视频时，改用 `video-convert`

## 常见工作流

### 画布生成后继续处理图片

1. 引导用户先在画布 v3 流程中完成图片生成
2. 如需后续处理，再调用 `image-process`

### 视频下载并提取音频

1. `video-download(url: "...")`
2. `video-convert(action: "extract-audio", filePath: "...", outputPath: "output.mp3")`

### 批量图片格式转换

对每张图片调用 `image-process(action: "convert", filePath: "...", format: "webp", outputPath: "...")`
