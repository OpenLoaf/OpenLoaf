# Project Move Parent Design

Date: 2026-01-18

## Goals
- Allow moving a project under another project (become child).
- Allow detaching a child project to root.
- Provide two entry points: drag and drop in ProjectTree and controls in ProjectBasicSettings.
- Always require confirmation before applying the move.

## Non-goals
- Do not change project storage paths.
- Do not add new backend endpoints or change project schema.

## User flow
- Drag from ProjectTree to target project or root drop zone.
- On drop, open confirm dialog with source and target labels.
- Confirm triggers move; cancel does nothing.
- ProjectBasicSettings shows current parent, "Change parent" opens selector, "Move to root" detaches.
- Settings actions open the same confirmation dialog.

## UI changes
- ProjectTree: enable drag for project nodes, track dragOver target, show highlight, show root drop zone when dragging.
- ProjectTree: use pendingMove state and confirm dialog; do not reorder until confirmed.
- ProjectBasicSettings: add parent field + buttons. Use tree picker dialog to select target; exclude self and descendants.

## Data and logic
- Use project.list to build tree; derive parentId map and descendant sets.
- Use trpc.project.move with { projectId, targetParentProjectId }.
- On success, invalidate project.list; on error, toast and keep UI.

## Error handling
- Prevent selecting self or descendants in UI.
- Backend errors surfaced in toast; cancel resets pending move state.

## Testing
- Manual checks: drag to another project, drag to root, cancel, confirm, invalid targets, verify list refresh.
- Automated tests are not added per user request.
