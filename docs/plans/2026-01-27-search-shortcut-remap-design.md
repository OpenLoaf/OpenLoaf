# Search Shortcut Remap Design

## Context
The app currently uses `Mod+K` to toggle the global search overlay, while `Cmd+F` is used inside the board panel to toggle fullscreen. There are also UI labels that surface `Cmd+F` in the file system view. The requested behavior is to make search use `Cmd+F`/`Ctrl+F` and move any other `Cmd+F` usage to `Cmd+K`/`Ctrl+K`.

## Goals
- Use `Mod+F` to toggle the global search overlay.
- Replace all other `Cmd+F`/`Ctrl+F` usages with `Cmd+K`/`Ctrl+K`.
- Keep current behavior and routing of events intact.

## Approach
- Update global shortcut definitions and listeners in `apps/web/src/lib/globalShortcuts.ts` to use `Mod+F` for search.
- Update board panel shortcut labeling and keydown interception to use `Cmd+K`/`Ctrl+K`.
- Update file system search label to reflect `Cmd+K`/`Ctrl+K`.

## Files to Change
- `apps/web/src/lib/globalShortcuts.ts` (search shortcut mapping and label).
- `apps/web/src/components/board/BoardPanelHeaderActions.tsx` (label and keydown handling).
- `apps/web/src/components/project/filesystem/components/ProjectFileSystem.tsx` (label only).

## Testing
- On macOS, verify `Cmd+F` opens search and `Cmd+K` toggles board fullscreen while focused on a board.
- On Windows/Linux, verify `Ctrl+F` opens search and `Ctrl+K` toggles board fullscreen.
- Confirm labels match behavior in tooltips and file system UI.
