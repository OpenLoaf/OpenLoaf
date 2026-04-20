---
name: media-ops-skill
description: >
  Process local image / video / audio files, or download videos from the web. Images: resize, crop, rotate, convert format (→webp/png/jpeg), apply filters, inspect dimensions. Video: convert format, extract audio, inspect metadata. Download: public videos from YouTube / Bilibili etc. Also the go-to skill for post-processing AI-generated images (format conversion, resizing). **Not for**: AI generating images/video/voice from scratch (→cloud-media-skill), or rendering charts inline (→visualization-ops-skill).
tools: [ImageProcess, VideoConvert, VideoDownload]
---

# Image / Video / Audio Processing

This skill covers three local media tools. **Image processing is the primary capability**.

> **⚡ Act immediately upon reading this** — do not stop to reply to the user. Right now, call `ToolSearch(names: "ImageProcess")` to activate the tool schema, then call `ImageProcess` to complete the operation. **All three steps must happen within the same response.**

## Tool Inventory

| Tool | Responsibility |
|------|---------------|
| `ImageProcess` | Image processing: resize / crop / rotate / flip / format conversion / grayscale / blur / sharpen / tint / metadata |
| `VideoConvert` | Video format conversion / audio extraction / metadata |
| `VideoDownload` | Download public videos from YouTube / Bilibili etc. |

> **Loading**: all are deferred tools; run `ToolSearch(names: "ImageProcess,VideoConvert,VideoDownload")` to activate their schemas before calling.

## Decision Tree

```text
User needs a media operation
├── Process an image? (resize / crop / rotate / convert / filter / inspect)
│   └── ImageProcess
├── Process a video?
│   ├── Format conversion / resolution change → VideoConvert (action: convert)
│   └── Extract audio → VideoConvert (action: extract-audio)
├── Inspect file info?
│   ├── Image (dimensions / format / DPI) → ImageProcess (action: get-info)
│   └── Video (duration / resolution / codec) → VideoConvert (action: get-info)
└── Download a video from the web?
    └── VideoDownload
```

## ImageProcess — Image Processing

Powered by sharp. **Also applies to AI-generated images**.

| action | Purpose | Key parameters |
|--------|---------|----------------|
| `get-info` | Read dimensions, format, DPI, file size | filePath only |
| `resize` | Scale | `width`/`height`/`fit` |
| `crop` | Rectangular crop | `left`/`top`/`width`/`height` |
| `rotate` | Rotate | `angle` |
| `flip` | Flip | `direction` |
| `convert` | Format conversion | `format` (png/jpeg/webp/avif/tiff) |
| `grayscale`/`blur`/`sharpen`/`tint` | Filter effects | Each has its own parameters |

**Run get-info first**: know the original dimensions and format before operating — for example, if the user says "shrink by half", you need the original width/height to compute the target.

**Output path**: by default, append a suffix (e.g. `photo_resized.jpg`). Overwriting in place is risky — the user may need the original for comparison or rollback. Only overwrite when explicitly requested.

## VideoConvert — Video/Audio Conversion

Powered by FFmpeg; handles format conversion and audio extraction on existing files.

| action | Purpose | Key parameters |
|--------|---------|----------------|
| `get-info` | Read duration, resolution, codec, stream info | filePath only |
| `convert` | Video format conversion | `format`, `resolution` |
| `extract-audio` | Extract audio from video | `audioFormat` (mp3/wav/aac/flac) |

**Format guidelines**:
- Universal: MP4 (H.264) — plays on virtually any device
- Efficient: WebM (VP9) — smaller files, slightly weaker compatibility
- Audio: MP3 (universal), FLAC (lossless)

**Large files**: transcoding time scales with file size. Warn the user upfront for files over 500 MB.

## VideoDownload — Video Download

Downloads public video URLs via yt-dlp.

**Use when**: the user provides a public video link and needs it locally for further processing.

**Not applicable**:
- Generating a new video → cloud-media-skill
- Converting an existing local video → `VideoConvert`
- Private / login-required videos → tell the user yt-dlp only handles public content

**Common follow-ups**: proactively ask whether the user needs audio extraction, format conversion, or trimming after download.

## Common Workflows

### Post-processing AI-generated images

```
CloudImageGenerate(…) → get absolutePath
ImageProcess(action: "get-info", filePath: "…")   # confirm original dimensions
ImageProcess(action: "convert", filePath: "…", format: "webp", outputPath: "…")
```

### Video download → audio extraction

```
VideoDownload(url: "...") → get filePath
VideoConvert(action: "extract-audio", filePath: "...", outputPath: "output.mp3")
```

### Batch image format conversion

Call `ImageProcess(action: "convert", format: "webp")` for each image. WebP maintains visual quality at roughly 70% of JPEG file size — ideal for web delivery.

## Common Pitfalls

**Unsupported format** → check whether the extension matches the actual encoding. Confirm the real format with `get-info` first.

**Output path matches input path** → some operations don't support in-place overwrite. Use a different outputPath and notify the user if replacement is needed afterward.

**"Compress the image" is ambiguous** → may mean: reduce dimensions (resize), lower quality (adjust quality in convert), or switch format (jpeg→webp). Clarify proactively.
