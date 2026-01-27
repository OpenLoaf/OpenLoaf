# Search Input Project Scope UI Design

## Context
The search dialog currently renders a plain command input. We want to show the current project name on the left side of the search input, separated by a `/`, and allow users to clear the project scope by pressing the delete key. This is UI-only for now; no search logic changes.

## Goals
- Display current project name on the left side of the search input.
- Show `/` as a visual separator between project name and search text.
- Allow users to press Backspace/Delete to clear the project scope.
- Keep the rest of the search dialog behavior unchanged.

## Approach
- Add a dedicated `SearchInput` component under `apps/web/src/components/search/` to keep UI logic local without modifying the shared `CommandInput`.
- Track the active project id by reading the current tab runtime params and chat params:
  - Prefer `runtime.base.params.projectId`, fallback to `tab.chatParams.projectId`.
- Resolve the project title from `useProjects()` + `buildProjectHierarchyIndex()` and fall back to `未命名项目` when missing.
- Add `searchValue`, `scopedProjectId`, and `projectCleared` state to `Search.tsx`:
  - On open, if not cleared by user, populate `scopedProjectId` from active tab.
  - On close, reset state.
- When the input is empty and a project is scoped, pressing Backspace/Delete clears the project scope.

## Files to Change
- `apps/web/src/components/search/Search.tsx`
- `apps/web/src/components/search/SearchInput.tsx` (new)

## Testing
- Manual: open search and confirm the project name + `/` shows on the left.
- Manual: type text and ensure the separator stays visible.
- Manual: clear input and press Backspace/Delete to remove the project tag.
- Manual: close and reopen search to re-scope to current project.
