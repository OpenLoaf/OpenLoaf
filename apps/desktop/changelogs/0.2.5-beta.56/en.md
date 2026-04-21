## What's Changed

### ✨ New Features

- **Native vision for PPTX slides**: When the model has native image input capability, rendered PPTX slides are now embedded directly into the model context via attachment tags — no extra CloudImageUnderstand call needed

### 🐛 Bug Fixes

- **Server build failure**: Added `skia-canvas` to esbuild external list — native modules cannot be bundled, fixing the CI build break in beta.55
