## What's Changed

### ✨ New Features

- **Auto-select default cloud model**: When no chat model is configured, automatically picks the first available cloud model from SaaS and saves it to settings — no more manual setup required
- **Browser testing infrastructure**: Added Vitest browser mode with Playwright for end-to-end AI chat testing (`pnpm test:browser`)
- **Cross-category variant discovery**: Empty canvas nodes now show text-to-image/text-to-video variants from the text feature category, expanding creative options

### 🚀 Improvements

- **Shell command approval**: Added support for shell flow-control keywords (`for`, `while`, `if`, `case`, etc.), block intro keywords (`do`, `then`, `else`), and comment/shebang line filtering — shell scripts with loops and conditions now auto-approve correctly
- **Cloud skill guidance**: Enhanced `CloudCapDetail` guidance — video/audio/digital-human variants now require explicit schema lookup before generation; added rate-limit guidance (max 2 concurrent requests per variant)
- **File path resolution**: Fixed absolute path handling in attachment resolver to prevent path doubling when resolving files outside the OpenLoaf root
- **Sidebar redesign**: Replaced tooltip-only icon buttons with icon + label layout for better discoverability
- **PDF tool UI**: Rewrote PdfTool component with self-contained rendering using shared ToolOutput primitives, no longer depends on OfficeToolShell

### 💄 UI Polish

- **Canvas node styling**: Removed dashed borders and box shadows from empty-state nodes (image, video, audio, text, file, link, table) for cleaner appearance
- **Canvas drag CSS**: Simplified node drag styles — removed media node pseudo-element borders and dark theme shadow overrides
- **Table node defaults**: Changed default table to 4 columns × 4 rows with narrower column width (90px) for better fit
- **Link node default size**: Reduced default link node height from 120px to 60px

### ⚡ Performance

- **Video node poster capture**: Now captures video dimensions alongside the poster frame, using browser-decoded size as a fallback to adjust node aspect ratio before ffprobe returns — prevents blank whitespace on newly generated videos

### 🐛 Bug Fixes

- **Image edit variant slot**: Editing mode no longer hides the node's own image from the AI panel input slots — `imageEdit` variants can now correctly reference the source image
- **Agent detail panel**: Removed unused model selection UI from agent settings (migrated to basic config in previous refactor)

### 🔧 Refactoring

- **Office skills**: Compressed and optimized DOCX, PDF, PPTX, XLSX skill markdown — removed redundant sections, tightened instruction formatting
- **Removed file-ops skill**: Deleted obsolete `file-ops` built-in skill (functionality covered by other skills)
- **Tool component cleanup**: Unified tool rendering across 10+ tool components (Edit, Read, Write, Glob, Grep, Shell, etc.) to use shared `getDisplayPath` and `isToolStreaming` utilities

### 📦 Dependencies

- Added `@vitest/browser`, `@vitest/ui`, `playwright`, `vitest-browser-react` for browser testing
