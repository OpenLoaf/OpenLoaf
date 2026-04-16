## What's Changed

### ✨ New Features

- **CJK PDF creation**: PDF engine now auto-embeds Noto Sans SC font when CJK characters are detected — no more docx-to-PDF workaround for Chinese/Japanese/Korean content
- **Board window zoom lock**: Disabled all page zoom in dedicated board windows (Ctrl/Cmd +/-, trackpad pinch) to prevent conflict with canvas zoom gestures

### 🚀 Improvements

- **Cloud media skill**: Improved input normalization and workflow guidance for image/video/audio generation
- **PixiJS init safety**: Rewrote Pixi canvas initialization with local cancel tokens instead of shared ref — fixes Strict Mode double-mount race conditions

### 🐛 Bug Fixes

- **PDF text rendering**: CJK text in `PdfMutate create` and `DocConvert text→PDF` now renders correctly instead of blank

### 🔧 Refactoring

- **Browser test harness**: Updated ChatProbeHarness with improved server URL handling and probe helpers (default timeout 120s)
- Added 9 new browser test cases (docx-to-pdf, xlsx-to-docx, pdf-to-pptx, cloud image/video/TTS, browse discovery)
