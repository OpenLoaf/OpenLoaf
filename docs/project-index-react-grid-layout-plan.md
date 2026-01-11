# Project Index Homepage Plan (react-grid-layout)

> Status: kept as an alternative. The current direction is `dnd-kit + CSS Grid + motion/react` for iOS-like live reflow and hit-testing. See `docs/project-index-dnd-kit-plan.zh-CN.md` (Chinese) for the updated plan.

## Overview
Project home is a desktop-like canvas built on `react-grid-layout` (RGL). Users place widgets (files, folders, calendars, links, etc.) on a resizable grid and organize them into groups that open like iOS app folders. Group open/close should reuse the existing tab stack logic to keep behavior consistent with other panels.

## Goals
- Desktop-like, glanceable dashboard with direct actions.
- Widgets are resizable and movable on a freeform grid.
- Grouping behaves like iOS folders: collapse to a single tile, open to show a group view.
- Reuse existing tab stack logic for the open/close experience.

## Non-goals
- Not a full file manager or calendar app.
- No collaboration or multi-user layouts (out of scope for now).

## UX Principles
- Always keep spatial memory: items should return to where they were.
- Edit actions are deliberate: drag/resize only in edit mode.
- The grid is a canvas, not a list.

## Grid System (RGL)
- Use `ResponsiveGridLayout` for breakpoints.
- Recommended breakpoints and columns:
  - `lg` (1200+): 12 cols
  - `md` (996): 10 cols
  - `sm` (768): 6 cols
  - `xs` (480): 4 cols
  - `xxs` (0): 2 cols
- `rowHeight`: 24 (tune for card density)
- `margin`: [12, 12]
- `containerPadding`: [16, 16]
- `compactType`: null (avoid auto-compaction)
- `preventCollision`: true (in edit mode)
- Drag handle: only on a visible handle in edit mode (avoid accidental drags)
- Resize handles: only in edit mode

## Widget Types (MVP)
- Folder widget: shows recent files and open action
- File widget: preview + open action
- Calendar widget: today + upcoming
- Link widget: title + open action
- Todo widget: quick check list
- Quick action widget: new file/shortcut
- Project overview widget: summary metrics
- Search widget: quick project search

## Size Presets
Define presets as grid sizes per breakpoint.
- Small: 2x2
- Medium: 3x2
- Large: 4x3
- Wide: 6x2
- Tall: 3x4

## Group (Folder) Behavior
- Create group: drag a widget onto another widget to merge into a group.
- Group tile (collapsed):
  - Name + count badge
  - 3-4 small thumbnails representing contained widgets
- Open group:
  - Trigger a tab stack item (reuse stack logic) to open a group view.
  - Keep visual origin by anchoring to the group tile position.
- Group view (expanded):
  - Renders a nested RGL grid for items in that group.
  - Allows rearranging, resizing, and removing items from the group.
- Remove from group: drag item out or use an action.
- Ungroup: remove all items back to the main grid.

## Stack Reuse (Open Group)
- Opening a group pushes a stack item (e.g., `project-group-panel`).
- The stack panel hosts the group grid view.
- Closing the stack item returns the user to the base grid.
- This keeps open/close behavior consistent with other panels (browser, file viewer).

## Interaction Flows
- Add widget:
  1. Open widget picker
  2. Choose widget
  3. Place on grid (auto placement)
  4. Configure (optional)
- Edit layout:
  1. Enter edit mode
  2. Drag/resize widgets
  3. Save layout
- Group creation:
  1. Drag one widget onto another
  2. Confirm merge
  3. Group tile replaces both items
- Open group:
  1. Click group tile
  2. Stack opens group panel
  3. Close to return

## State Model (High-level)
A minimal data model to support grid + groups.

```ts
export type ProjectWidgetType =
  | "file"
  | "folder"
  | "calendar"
  | "link"
  | "todo"
  | "quick-action"
  | "overview"
  | "search"
  | "group";

export type ProjectWidget = {
  id: string;
  type: ProjectWidgetType;
  title: string;
  config: Record<string, unknown>;
  layoutByBreakpoint: Record<string, RGL.Layout>;
  groupId?: string | null;
};

export type ProjectGroup = {
  id: string;
  title: string;
  widgetIds: string[];
  layoutByBreakpoint: Record<string, RGL.Layout>;
};
```

## Persistence
- Save layout and widget state per project.
- Separate layout for each breakpoint.
- Persist group contents and group layout.

## Empty State
- Provide a preset layout with 4-6 widgets.
- Offer one-click templates (Work, Dashboard, Minimal).

## Accessibility
- Keyboard navigation: arrow keys to focus items, Enter to open.
- Edit mode should be toggleable via keyboard.
- Ensure focus returns to the group tile when group panel closes.

## Migration Notes
- Replace Puck-based index with RGL-based layout.
- Map existing content blocks to widgets where possible.
- Keep project-level config compatible (or versioned).

## Open Questions
- Should groups allow nested groups (folders inside folders)?
- Do we allow widgets to span full-width on mobile, or keep grid scaling?
- Which widgets are mandatory for the default layout?
