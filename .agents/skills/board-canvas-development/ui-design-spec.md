# Canvas UI Design Spec

> Node layout specs (toolbar, panel, anchors per node type) → see [node-layout-spec.md](node-layout-spec.md)

## Button Style Rule

**System functional buttons** (toolbar, context menu, send, branch, fold) use **black/white only**:
- Default: `text-foreground` or `text-muted-foreground`
- Hover: `hover:bg-foreground/8 dark:hover:bg-foreground/10`
- Active: `bg-foreground text-background`
- Only exception: destructive actions use `text-destructive`

**Node content layer** uses TE semantic colors (ol-blue/green/amber/purple/red).

## ChatTurn Node

| Property | Value |
|----------|-------|
| Width | 360px fixed |
| Min height | 120px |
| Container | `bg-card border border-border/60 rounded-lg overflow-hidden` |
| Session bar | 3px left bar, `rounded-l-lg`, `backgroundColor: sessionColor` |
| Q section | `px-3 pt-3 pb-2`, 13px medium, `text-ol-text-primary` |
| A section | `px-3 pt-2 pb-3`, 13px normal, separated by `border-t border-ol-divider` |
| A max height | 300px + gradient fade `h-8 bg-gradient-to-t from-card to-transparent` |
| Resource thumbs | 52x52px, `flex-wrap gap-1.5`, max 5/row |
| Streaming dot | `h-1.5 w-1.5 animate-pulse rounded-full bg-ol-green` |
| Anchors | chat-in (left center), chat-out (right center), resource-out (right 75%, only when hasResources) |

### States
- **Empty**: MessageSquare icon + hint text + input box
- **Streaming**: Q fixed + A streaming + green pulse dot
- **Complete**: Q + A (truncated 300px) + resource thumbnails
- **Failed**: `bg-ol-red-bg/60` + AlertTriangle + error text + TaskID (copyable)
- **Selected**: Standard `--canvas-selection-border` via SelectionOverlay
- **Summary** (folded): 240x52px card, session color bar + title + "(N turns)" + expand button

## Session Colors (8-color palette)

| ID | Light hex | Dark hex | Use |
|----|-----------|----------|-----|
| indigo | `#4F46E5` | `#818CF8` | Line + border |
| teal | `#0D9488` | `#5EEAD4` | Line + border |
| rose | `#E11D48` | `#FB7185` | Line + border |
| cyan | `#0891B2` | `#67E8F9` | Line + border |
| amber | `#D97706` | `#FBBF24` | Line + border |
| violet | `#7C3AED` | `#A78BFA` | Line + border |
| lime | `#65A30D` | `#A3E635` | Line + border |
| coral | `#EA580C` | `#FB923C` | Line + border |

Background tint: base color at `alpha: 0.08` (light) / `0.12` (dark).
Auto-assign: `PALETTE_ORDER[sessionIndex % 8]`, maximizing adjacent color distance.

## Connector Visual

| Property | data-flow | chat-flow |
|----------|-----------|-----------|
| Width | 1.2px | 2.0px |
| Path | User-chosen style | Forced bezier curve |
| Color | `palette.connector` (neutral gray) | Session color |
| Alpha (idle) | 0.35 | 0.55 |
| Alpha (active) | 0.70 | 0.75 |
| Arrow | Yes (7px) | No |
| Dashed | User toggle | Always solid |
| Interactive | Yes (select/hover/drag) | No (pass-through) |
| Hit testing | Yes | Excluded |

### Selection animation (both types)
- Dash overlay on selected node's connectors
- data-flow: dash 8px, gap 6px, speed 40px/s, color `palette.selectionBorder`
- chat-flow: dash 10px, gap 7px, speed 50px/s, color session color
- Max 20 animated lines simultaneously

## Stack (Version Stack)

### Collapsed
- Badge: `rounded-full min-w-[20px] h-[20px]` at `-top-1.5 -right-1.5`
- Badge color: node semantic color (`bg-ol-blue` for image, `bg-ol-purple` for video, `bg-ol-green` for audio)
- Shadow hint: 1-2 offset border layers behind node (3px, 6px offset)
- Hover navigator: `[<] 1/4 [>]` at node bottom center

### Expanded (group tile)
- Card size: 160x160 (image) / 160x90 (video) / 120x120 (audio)
- Grid: flex-wrap, gap-3, max 5/row
- Group frame: semantic color bg (`bg-ol-blue/5`), dashed border (`border-ol-blue/20`)
- Primary: `ring-2 ring-ol-amber/40` + Star icon (amber)
- Version number: `#1` at bottom-right, `text-[10px] font-mono`

### Generate mode dropdown
- Split button: main generate + chevron dropdown
- Stack mode (default): normal generate button
- Overwrite mode: button text "Generate & Overwrite", amber accent

## AI Panel

### Layout (420px wide)
```
[Upstream assets area]
--- divider (my-3 h-px bg-ol-divider) ---
[Prompt textarea + enhance button]
[Parameters area (mb-3)]
[Generate button (pt-1)]
```

### Prompt Enhancement
- Button: `Wand2` icon at textarea bottom-right, `text-muted-foreground hover:bg-foreground/8`
- Loading: `Loader2 animate-spin` + shimmer overlay on textarea
- Preview: `bg-ol-purple/3 border-ol-purple/20` + "Enhanced" badge + action bar
- Action bar: [Confirm] [Re-enhance] [Cancel] in textarea bottom

### Upstream from ChatTurn (mixed resources)
- Group by type: image/video/audio/text sections
- Each group: title + count (`2/10`) + thumbnails
- Incompatible types: `opacity-50 grayscale` + Ban icon + hint text
- Selection: checkbox on each thumbnail, respects slot limits

## Task Status in Nodes

| Status | Icon | Color | Border |
|--------|------|-------|--------|
| Queued | `Clock animate-pulse` | `text-ol-purple` | `border-ol-purple/40` |
| Generating | `Loader2 animate-spin` | `text-ol-blue` | `openloaf-thinking-border` |
| Timeout | `AlertTriangle` | `text-ol-amber` | `border-ol-amber/50`, `bg-ol-amber-bg/40` |
| Failed | `AlertTriangle` | `text-ol-red` | `border-ol-red/80`, `bg-ol-red-bg/60` |
| Success | Fade-scale-in transition | - | Normal |

BottomBar optional queue summary: `[Loader2 {running}] [Clock {queued}]` in 11px.

## Recommend Buttons (TextNode)

Order: Text-to-Image (Sparkles, ol-blue) > Image-Reverse (ImagePlus, ol-blue) > Text-to-Video (Video, ol-purple) > Text-to-Speech (Volume2, ol-green)

Text-to-Image always visible. Image-Reverse conditional (empty text + no upstream image).

## @ Mention

### Picker panel
- Trigger: type `@` in ChatTurn input
- Size: w-72, max-h-80, rounded-lg, shadow-float
- Groups: Recent > Text > Image > Video > Audio
- Item: 28x28 thumbnail + title + type badge
- Keyboard: ArrowUp/Down, Enter, Escape

### Inline chip
- Shape: `rounded-md px-1.5 py-0.5`
- Color: per node type (image=ol-blue-bg, video=ol-purple-bg, text=foreground/6, audio=ol-green-bg)
- Content: type icon 12px + truncated title (max-w-32)
- Click: pan canvas to referenced node + highlight flash

### In completed turn
- Clickable tag: `rounded px-1 py-0.5 bg-ol-blue-bg text-ol-blue`
- Deleted node: `bg-muted/50 text-muted-foreground/60 line-through cursor-default`

## Session Management

### Create session
- LeftToolbar Insert: `MessageSquarePlus` icon, `text-ol-green` (content layer color OK)
- Right-click menu: "AI Chat" after "Insert File"
- Empty guide: green accent button

### Continue conversation
- Last turn bottom: dashed border input box, session color border on focus
- Send creates new turn at `lastTurn.x + width + 80px, lastTurn.y`

### Branch
- Toolbar button: `GitBranch` icon (black/white per button rule)
- Branch input: pops at source turn right-bottom (+80px, +60px)
- Amber dashed preview line from source to branch input

### Fold/Expand
- Fold button: root turn top-left, `ChevronsLeftRight`, hover-visible
- Summary node: 240x52px, session color bar + title + expand button
- Pure view layer, not in doc.elements, not in undo/redo

## Group System

### Workflow group
- Background: `bg-slate-500/6` (neutral)
- Border: `border-border/50` solid
- Title: outside top-left, `GitBranch` icon + editable name

### Stack group (expanded)
- Background: semantic color `bg-ol-blue/5` (per node type)
- Border: dashed `border-ol-blue/20`
- Title: `Layers` icon + "Versions (N)"

### Template system
- Save: `BookmarkPlus` in group toolbar, dialog with name + entry node identification
- Library: LeftToolbar Insert panel "Templates" section
- Execute: `Play` button in group title bar (black/white style)
- Locked nodes: `bg-background/40 backdrop-blur-[1px]` overlay + Lock icon
- Detach: `Unlock` button, confirm popover

## Visual Issues to Fix

| Priority | Issue | Fix |
|----------|-------|-----|
| P0 | ImageNodeSkeleton hardcoded white | Use CSS vars |
| P1 | ol-amber contrast 1.9:1 | Darken to `#8a6200` in light mode |
| P1 | ol-text-auxiliary contrast 2.8:1 | Darken from `#a1a7af` to `#8a8f96` |
| P1 | NodeLabel z-index overlap | Add `z-index: 1` |
| P2 | Non-related connectors no dimming on selection | Alpha to 0.15 |
