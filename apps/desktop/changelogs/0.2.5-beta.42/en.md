## What's New

### ✨ Skill Marketplace
- Browse, install, and manage skills from the marketplace
- Update notifications with one-click update or batch update all
- Skill detail dialog with ratings and descriptions
- Full i18n support (EN, ZH-CN, ZH-TW, JA)

### 🚀 Context Window Management
- More conservative token estimation to prevent API 400 errors
- Three-pass trim strategy: compress → progressive drop → hard tail-keep
- Proper token estimation for image, file, and tool-invocation parts
- Auto-compact now falls back to hard trim when summarization fails or no model is available

### 🔒 Security
- Prevent zip path traversal attacks in skill import
- Sanitize temp file names during skill import
- Add 64MB size limit on skill archive imports

### 🐛 Bug Fixes
- Friendlier error messages for skill translation failures (model not configured, network errors, SaaS quota issues)

### 💄 UI Improvements
- Browser panel: larger bottom corner radius
- Floating panels: cleaner look without borders and shadows
- Feedback dialog: use modern `userAgentData` API for platform detection

### 📦 Dependencies
- Upgrade @openloaf-saas/sdk to v0.1.34
