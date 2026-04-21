## What's Changed

### ✨ New Features

- **macOS computer use (experimental)**: New `MacosObserve` / `MacosAct` tools let the agent read and act on the macOS desktop via a dedicated helper — opening a path to full on-device automation
- **Cloud task resume & cancel**: Long-running cloud tasks (image / video generation) are now persisted server-side — if the client disconnects, results are recovered on reconnect, and in-flight tasks can be cancelled cleanly

### 🚀 Improvements

- **Qwen multimodal middleware**: New adapter middleware lets Qwen models receive attachments through the native vision channel, matching the existing flow for other providers
- **Attachment tag expander**: More robust handling of attachment tags before they reach the model, with tighter runtime tool guidance in the master harness
- **PPTX viewer**: Smoother rendering and interaction for embedded slide previews

### 💄 UI Polish

- **Tool message UI**: Error rendering (`MessageError`) and the Office tool shell got visual cleanup; file preview opening and stack header wiring refined
- **AI debug viewer**: Minor layout tweaks

### 🐛 Bug Fixes

- **Cloud image flows**: Handle credits-insufficient, concurrent-limit, and resource-exhausted responses with clearer error messages (i18n across zh/en/ja/zh-TW)

### 🔧 Internal

- Added cloud mock infrastructure and macOS-control browser tests
- New `fs` router endpoints supporting the macOS control flow
