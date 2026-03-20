## ✨ New Features

- **Canvas AI workflow complete redesign** — rebuilt from Phase 0 through Phase 2 with new node architecture, AI panels, and generation pipeline
- **Version stack for media nodes** — image, video, and audio nodes now support version history with overlay navigation
- **Audio AI Panel** with workflow templates and batch download
- **Multi-result pagination** for AI image generation
- **Image upscale** via SaaS API with dynamic model lists
- **Node search**, enhanced context menu, lock & z-order controls
- **Placement tools**, sticky notes, and shape nodes
- **Floating insert menu** for quick node creation
- **Generating overlay** with countdown timer and progress indication
- **Mask paint overlay** for inpainting workflows
- **Audio wave player** component for audio node preview
- **Credit estimation service** for generation cost preview
- **Dev-stage notice dialog** shown on first launch
- **Japanese (ja-JP)** locale scaffolding

## 🚀 Improvements

- Text nodes redesigned as sticky notes with AI recommend buttons
- AI toolbar connected to deriveNode with image/video generation integration
- Preview guards, video download, empty guide, and group titles
- Connector layer (PixiConnectorLayer) enhanced rendering with animated dashes
- Calendar service improvements (macOS CalendarHelper)
- Chat session management enhancements
- Agent management UI overhaul
- Media proxy with server-side URL resolution for SaaS submission
- ImageViewer improvements

## 🐛 Fixes

- Panel unlock button now correctly wired to editingOverride state
- AI panel editing works after clicking regenerate in toolbar
- Local media URLs resolved server-side before SaaS submission
- Local image URLs converted to base64 before sending to SaaS API
- 9 auto-layout bugs in canvas engine fixed
- AI panel scale syncs in real-time during zoom
- AI panel centering and fixed screen size rendering
- PlacementTool shortcut ordering fix

## 🌐 i18n

- Board namespace expanded (45+ keys per locale)
- Settings namespace additions
- Japanese locale scaffolding (ja-JP)

## 🔧 Refactoring

- Deprecated AI/chat canvas nodes removed, FallbackNode added
- ShapeNode merged into TextNode as style='shape' variant
