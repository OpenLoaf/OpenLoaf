# OpenLoaf 0.2.5-beta.52

## ✨ New Features

- **Unified Read tool**: the `Read` tool now dispatches PDF, DOCX, XLSX, PPTX, images and other media through MIME detection, so a single entry point handles every document format.
- **Document preview tool**: new `DocPreview` tool surfaces inline previews for office documents directly inside chat messages.
- **Skill creator builtin**: added a `skill-creator` builtin skill so the agent can scaffold and author new skills from a chat.

## 🚀 Improvements

- **Chat model selection moved to basic config**: master agent's chat model is now driven by global `chatModelId` / `chatSource` instead of per-agent JSON, unifying where models are picked.
- **Office authoring split into 4 focused skills**: the monolithic office skill has been split into dedicated `create-pdf`, `create-docx`, `create-xlsx` and `create-pptx` skills, each scoped to authoring only (reading goes through `Read`).
- **Consolidated chat storage & agent execution**: folded `chatSessionPathResolver` into `chatFileStore`, tightened the agent executor / approval loop, and refreshed tool scopes and timeouts.
- **Refreshed AI message tool UI**: updated `ToolSearch`, `WebSearch`, `WriteFile`, `JsxCreate` and markdown renderers for a cleaner tool-call presentation.
- **Bundled PDF.js assets**: PDF.js is now copied into `apps/web/public/pdfjs` during postinstall, removing the runtime CDN dependency for the PDF viewer and streaming code viewer.

## 🔧 Refactor

- Reorganised builtin skills (`create-docx`, `create-pdf`, `create-pptx`, `create-xlsx` → `docx` / `pdf` / `pptx` / `xlsx`) and regenerated the skills index.
- Rewrote the master prompt-v5 templates (en/zh) and harness guidance to match the new tool topology.
- Updated chat attachment controllers, routes and image resolvers to go through the unified attachment path.

## 🌐 Internationalization

- Added new AI tool strings across en-US, zh-CN, zh-TW and ja-JP locales for the new preview / skill flows.
