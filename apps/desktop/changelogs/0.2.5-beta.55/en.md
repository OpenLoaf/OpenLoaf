## What's Changed

### ✨ New Features

- **JsSandbox tool**: Introduced a unified JavaScript sandbox tool that replaces the legacy Office/PDF Mutate tools — user code can now directly `import` preinstalled libs (docx, exceljs, pdfkit, pptxgenjs, etc.) inside the sandbox
- **PdfInspect + PdfMutate rewrite**: New read-only `PdfInspect` tool for PDF analysis, and `PdfMutate` rewritten with 12 focused actions (including table border drawing, grid-based table extraction, and PDF→XLSX conversion)
- **Excel v2 tool suite**: New inspect / mutate / recalc engines with full TDD coverage and a rewritten xlsx skill guide (zh + en)
- **DocX skill overhaul**: Replaced monolithic docx tools with `WordInspect` + `WordMutate` pair, backed by 53 TDD tests
- **Named cloud tools**: Image / video / audio generation are now first-class named tools with dedicated UI renderers instead of a single generic cloud tool
- **PptxInspect + CloudImageUnderstand**: Added PPTX page-rasterization inspect engine (for LLM vision) and a Cloud Image Understand tool with its own UI card
- **Native multimodal attachments**: Attachment tags are now upgraded to native multimodal file parts — the auxiliary model also accepts multimodal input
- **English skill variants**: All builtin skills now have English variants and auto-switch based on prompt language; `promptLanguage` can be overridden per request
- **Web search core tool**: Promoted `WebSearch` to a core tool available to all agents
- **Project browser test suite**: New `project` suite in the browser test runner, with per-case summary caching
- **Linux support**: Linux frameless window + FUSE-less AppImage packaging

### 🚀 Improvements

- **Crash recovery**: Server now restarts in-place on crash with a disconnect fallback, so chat sessions survive backend restarts
- **Desktop startup**: Loading window is now closable and the quit-confirm dialog is skipped during startup
- **System agents**: Builtin agents and skills are now inlined; internal tool cards auto-hide; system agents align with master tool/skill lists
- **Capability routing**: `reasoning` is now a first-class v3 capability; media capability pills in the model picker are color-coded
- **Chat UX**: Added search input to the chat session list; thinking state shows pending tool calls; board view uses `overflow-clip` to avoid scroll drift
- **Create-tool scoping**: `CreateTool` writes now scoped to project or session asset dir
- **Docx report defaults**: Polished default styling and hardened JSON-string parameter error messages
- **ToolSearch activation**: Softened activation guard so the model triggers it more reliably
- **Skill Market UI**: Polish pass plus new browser test harness coverage

### 🐛 Bug Fixes

- **JsSandbox imports**: Symlink `node_modules` into the sandbox scripts dir so user code can import preinstalled libs
- **PDF skill docs**: Documented that pdfkit has no save/restore API (prevents the model from generating broken code)
- **SaaS raw proxy**: Inject `/api/saas/raw` proxy prefix in the probe harness fetch path
- **Cloud tool hints**: Descriptions now explicitly tell the model not to re-display generated media and to accept flat input
- **Excel test imports**: Use relative import in excel test to avoid tsc rootDir ambiguity

### 🔧 Refactoring

- **Office/PDF Mutate removal**: Stripped residual Mutate tool implementations, definitions, and engines — all skills and tests migrated to JsSandbox
- **Browser test reorganization**: Restructured browser test tree; chat now tracks `hasAssets`; dropped schedule templates
- **Report slimming**: Browser test `--batch` is now mandatory and the HTML report drops screenshots + timeline in favor of DOM snapshots

### 📦 Dependencies

- Upgraded `@openloaf-saas/sdk` from `0.1.46` → `0.2.3`
- Added `node-pptx-png-v2` for PPTX page rasterization
