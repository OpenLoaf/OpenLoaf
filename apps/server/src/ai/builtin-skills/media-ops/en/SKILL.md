---
name: media-ops-skill
description: >
  Triggered when the user already has image / video / audio files to process: resize, crop, apply filters, convert formats, compress, inspect metadata, extract audio tracks; also for downloading videos from URLs like YouTube / Bilibili. Typical phrasings include "convert to webp", "extract the audio", "download this Bilibili video". **Not for**: AI generating images / voiceovers / music from scratch (→cloud-media-skill), or rendering charts inline in the conversation (→visualization-ops-skill).
---

# Media Processing and Download

This skill covers the three media tools provided directly by the server agent. AI image/video **generation** has been migrated to the canvas v3 workflow — this skill is responsible for **processing existing files and downloading videos from the web**.

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|---------------|-----------|
| `ImageProcess` | Processing existing images (resize / crop / rotate / flip / format conversion / grayscale / blur / sharpen / tint / metadata) | No |
| `VideoConvert` | Video format conversion / audio extraction / metadata reading | No |
| `VideoDownload` | Downloading videos from public URLs such as YouTube / Bilibili | No |

> **Loading**: all are deferred tools; before calling, you must first run `ToolSearch(names: "ImageProcess,VideoConvert,VideoDownload")` to activate their schemas.

## Decision Tree

```text
User needs a media operation
├── Generate a brand-new image/video?
│   └── Route to canvas v3 (the server agent does not generate directly)
├── Process an existing file?
│   ├── Image (resize/crop/rotate/convert/blur/sharpen/grayscale) → ImageProcess
│   ├── Video format conversion / resolution change → VideoConvert (action: convert)
│   └── Extract audio from video → VideoConvert (action: extract-audio)
├── Inspect file info?
│   ├── Image metadata (dimensions/format/DPI) → ImageProcess (action: get-info)
│   └── Video metadata (duration/resolution/codec) → VideoConvert (action: get-info)
└── Download a video from the web?
    └── VideoDownload
```

## ImageProcess — Image Processing

Powered by sharp; transforms existing images.

| action | Purpose | Key parameters |
|--------|---------|----------------|
| `get-info` | Read dimensions, format, DPI, file size | filePath only |
| `resize` | Scale | `width`/`height`/`fit` |
| `crop` | Rectangular crop | `left`/`top`/`width`/`height` |
| `rotate` | Rotate | `angle` |
| `flip` | Flip | `direction` |
| `convert` | Format conversion | `format` (png/jpeg/webp/avif/tiff) |
| `grayscale`/`blur`/`sharpen`/`tint` | Filter effects | Each has its own parameters |

**Run get-info first before processing**: know the original dimensions and format to avoid blind operations — for example, if the user says "shrink by half", you need the original width and height to compute the target values.

**Output path decision**: by default, append a suffix (e.g. `photo_resized.jpg`). Overwriting the original file in place is risky — the user may still need the original for comparison or rollback. Exceptions apply only when the user explicitly asks to overwrite.

## VideoConvert — Video/Audio Conversion

Powered by FFmpeg; handles format conversion and audio extraction on existing files.

| action | Purpose | Key parameters |
|--------|---------|----------------|
| `get-info` | Read duration, resolution, codec, stream info | filePath only |
| `convert` | Video format conversion | `format`, `resolution` |
| `extract-audio` | Extract audio from video | `audioFormat` (mp3/wav/aac/flac) |

**Format selection guidelines**:
- Universal compatibility: MP4 (H.264) — playable on virtually any device
- High-quality compression: WebM (VP9) — smaller files but slightly weaker compatibility
- Audio extraction: MP3 (universal), FLAC (lossless)

**Large-file caveat**: video transcoding time scales linearly with file size. Converting files over 500 MB can take a while — warn the user about the expected wait up front.

## VideoDownload — Video Download

Downloads public video URLs via yt-dlp.

**Use when**: the user provides a public video link and needs it downloaded locally for further processing (editing, audio extraction, transcoding).

**Not applicable when**:
- Generating a new video → canvas v3
- Converting a locally-existing video → `VideoConvert`
- Private / login-required videos → tell the user yt-dlp can only download public content

**Common follow-ups after download**: once the download finishes, users typically need further processing — extracting audio, converting format, cropping. Proactively ask whether any follow-up is needed instead of waiting for them to speak up.

## Common Workflows

### Video download → audio extraction
```
VideoDownload(url: "...") → get filePath
VideoConvert(action: "extract-audio", filePath: "...", outputPath: "output.mp3")
```

### Batch image format conversion
Call `ImageProcess(action: "convert", format: "webp")` for each image. WebP keeps visual quality while shrinking files to roughly 70% of JPEG size — ideal for web delivery.

### Post-processing canvas output
If an image generated by canvas v3 needs subsequent cropping, resizing, or format conversion, handle it with `ImageProcess`.

## Common Pitfalls

**Unsupported format** → check whether the file extension matches the actual encoding. The user may have named an `.mp4` file as `.avi`; confirm the real format with `get-info` first.

**Output path matches input path** → some operations don't support in-place overwrite. Use a different outputPath, and once done, notify the user if replacement is needed.

**"Compress the image" is ambiguous** → it may mean: reduce dimensions (resize), lower quality (adjust quality during convert), or switch format (jpeg→webp). Clarify intent proactively.
