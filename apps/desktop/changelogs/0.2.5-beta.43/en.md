## What's New

### ✨ Redesigned AI Tool System
- Renamed tools to intuitive names: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `Bash`
- Split monolithic fileTools into focused Read/Edit/Write modules
- New dedicated `Glob` tool (file pattern matching) and `Grep` tool (content search)
- Core tools always visible — no longer deferred behind ToolSearch

### 🚀 WebFetch & WebSearch Improvements
- WebFetch: LRU cache (15min TTL, 50MB max), manual redirect handling, URL validation, http→https auto-upgrade
- WebSearch: domain filtering (allowed/blocked domains), structured text output with sources reminder
- Both tools now return clean plain text format

### 🚀 Context Window Intelligence
- Microcompact: compress old tool results after idle gaps to save tokens
- Context collapse manager for smarter conversation history management
- Tool result interceptor for post-processing tool outputs

### 💄 UI Improvements
- Chat: single ChatInput instance prevents model selector state loss on page transition
- Canvas list: skip stagger animation on cache hit for instant rendering
- Canvas connectors: improved rendering in PixiConnectorLayer
- External skills: new import banner and dialog in skills settings

### 🔧 Agent & Prompt Refinements
- Expanded core tool set in agent factory
- Updated master and PM agent templates and identity prompts
- Refined builtin skill descriptions (file-ops, project-ops, workbench-ops, etc.)

### 🐛 Bug Fixes
- Auth callback page and route improvements
- StreamingCodeViewer stability fix
- Board view state and video node improvements

### 📦 Dependencies
- Added lru-cache for WebFetch caching
