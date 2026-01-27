# Search File + Workspace Search Design

## Context
The search dialog already supports quick actions and project-scoped input UI. We need to add file/folder fuzzy search results and support searching across all workspace projects when the project scope is cleared.

## Goals
- Add file/folder results in the search dialog with click-to-open behavior.
- Use stack mode to open files via `open-file.ts`.
- Navigate to ProjectFileSystem for folders.
- Add a workspace-level search API that returns project metadata alongside project-relative file info.

## Approach
- Extend `fs` router with a `searchWorkspace` endpoint that aggregates results across all workspace projects.
- Reuse the existing search traversal logic to keep match behavior consistent (substring match, depth limit, hidden filtering).
- Return results with project info (`projectId`, `projectTitle`) and project-relative entry data.
- In `Search.tsx`, call `fs.search` when project scope exists; call `fs.searchWorkspace` when scope is cleared.
- Render a new `CommandGroup` for file results; clicking a file opens stack preview, clicking a folder switches the project tab to the file system and navigates to the folder.

## Data Contract
`searchWorkspace` returns:
- `projectId`
- `projectTitle`
- `entry` (project-relative `uri`, `name`, `kind`, `ext`, `isEmpty`)
- `relativePath` (same as `entry.uri`, explicit project-relative path)

## Files to Change
- `packages/api/src/routers/fs.ts` (add `searchWorkspace`)
- `apps/web/src/components/search/Search.tsx` (wire search results + open behavior)
- `apps/web/src/components/search/SearchInput.tsx` (no change expected)

## Testing
- Manual: search in a scoped project and open a file in stack mode.
- Manual: clear project scope, search across workspace, open files and folders in the correct project.
