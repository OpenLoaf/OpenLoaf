✨ **New Features**
- Add resizable TextNode with drag handle and content overflow fade mask
- Add regenerate confirmation dialog, draft mode for AI chat
- Add FileSystemEntryVisual component with enhanced file context menu
- Add PDF polyfill and improved PDF parsing engine
- Add auto-compact for AI context window management
- Add file serve routes for direct file access
- Add media constraints system for canvas variant forms
- Add VariantFormTransition animation component

🚀 **Improvements**
- Refactor AI builtin skills to use semantic XML tags with streamlined descriptions
- Refactor AI panels (Image/Audio/Video) with extracted slot handlers
- Enhance InputSlotBar with improved layout and interaction
- Enhance VideoNode with better playback controls and state management
- Improve agentFactory with enhanced agent creation logic
- Improve video download tool with better resource management
- Streamline media proxy with simplified request handling
- Enhance chat file store with improved file operations
- Improve attachment resolver with cleaner image handling
- Enhance PixiApplication, DomNodeLayer, and theme resolver

💄 **UI Polish**
- Improve drag-drop overlay styling
- Enhance SelectionOverlay with better visual feedback
- Improve board node drag CSS transitions
- Update file viewers (Code, Doc, Excel, Image, Markdown, PlateDoc) with consistent styling

🌐 **i18n**
- Update translations for zh-CN, zh-TW, en-US, ja-JP (ai, board, project)

🐛 **Fixes**
- Fix dragRef ordering in pointerUp for board canvas
- Fix transition during resize drag and handle lost capture
- Fix camera icon replacement with spotlight beam
- Fix self-closing skill tags and desc attributes

🔧 **Refactor**
- Move skill descriptions from desc attribute to tag body
- Simplify email environment store
- Clean up browser automation tools scope handling
