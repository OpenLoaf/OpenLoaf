### ✨ New Features
- Runtime task system with plan approval workflow
- Plan mode delegation to plan subagent with debug inspection
- HTTPS support for desktop dev/prod services

### 🚀 Improvements
- Board TextAiPanel V3 with simplified text generation architecture
- Board TextNode enhanced rendering and ResizeHandle refactor
- AI ChatCoreProvider refactored for better state management
- HMR node re-registration for canvas templates

### ⚡ Performance
- Composite database indexes for board, chatSession, calendarItem queries

### 🔧 Refactoring
- Comprehensive AI module tech debt cleanup (47 items)
- Split 5 God Objects: agentManager, chatFileStore, settings, email, ProjectTree
- Extract shared formatting and split chatStreamService
- Streamline agent tools and shell sandbox exemption
- Eliminate 20 unnecessary `as any` and tighten z.any() schemas

### 🐛 Bug Fixes
- Fix HMR node re-registration for canvas templates
- Fix PlanItem type for step status tracking

### 📦 Dependencies
- Bump @openloaf-saas/sdk to 0.1.38
