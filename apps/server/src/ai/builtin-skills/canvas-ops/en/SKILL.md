---
name: canvas-ops-skill
description: >
  Triggered when the user wants lifecycle management of OpenLoaf canvases / whiteboards: create, open, filter, duplicate, delete, rename, or change ownership. Typical phrases: "open a whiteboard", "create an architecture diagram canvas", "clean up unused whiteboards". **Not for**: data-driven chart visualization (→visualization-ops-skill), AI image or video generation (→cloud-media-skill), editing nodes inside an already-open canvas (handled by the canvas sub-agent).
---

# Canvas Ops Skill

## Tool Roster

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `BoardQuery` | Query the canvas list or a single canvas detail (mode: `list` / `get`) | Yes |
| `BoardMutate` | Create / update / duplicate / delete a canvas (action: `create` / `update` / `delete` / `duplicate` / `clear-unbound`, etc.) | No |

> **Loading**: Both are deferred tools. Before calling, activate their schemas with `ToolSearch(names: "BoardQuery,BoardMutate")`.

## Which One Should I Use?

Pick by intent:

```
Want to see which canvases exist?          → BoardQuery (mode: list)
Want to filter canvases by project?        → BoardQuery (mode: list, with projectId)
Want to search canvases by keyword?        → BoardQuery (mode: list, with search)
Want to find orphan canvases with no project? → BoardQuery (mode: list, with unboundOnly: true)
Want a canvas's details and nodes?         → BoardQuery (mode: get, with boardId)
Want to create a new canvas?               → BoardMutate (action: create)
Want to change a canvas's title/pin/owner? → BoardMutate (action: update)
Want to delete a canvas?                   → BoardMutate (action: delete)  ← default
Want to permanently wipe it?               → BoardMutate (action: hard-delete)
Want to duplicate a canvas?                → BoardMutate (action: duplicate)
Want to clean up every orphan canvas?      → BoardMutate (action: clear-unbound)
```

## Node-Level Operations Inside a Canvas

Node editing inside a canvas (adding nodes, connecting edges, changing content) is done by a sub-agent or by the canvas editing tools — it is not directly performed by this skill. What you need to know:

- `BoardQuery { mode: "get" }` returns the canvas's **full node and edge information**, useful for understanding current content
- When the user says "add a box", "connect A to B", "edit this node's content" — those are node-level operations handled by the canvas editing agent
- Your responsibility is to **manage the canvas itself** (create, delete, ownership, duplicate), not to manipulate elements inside it

## Cross-Skill Collaboration

Complex scenarios require multiple skills working together:

- User says "create a project architecture flowchart" → first use `ProjectQuery` to understand the project structure, then `BoardMutate { action: "create" }` to create the canvas, and finally let the canvas editing agent add nodes and edges based on that structure
- User says "visualize the task board" → first use `TaskStatus` to fetch the task list, then create the canvas and hand off layout to the editing agent

## Core Workflows

### Workflow 1: Create a New Canvas

```
1. Confirm the desired canvas title and owning project
2. BoardMutate (action: create, title: "...")   → receive boardId
3. If it should belong to a project, include projectId at create time
```

### Workflow 2: Tidy Up Canvases

```
1. BoardQuery (mode: list)                      → fetch all canvases
2. Analyze which ones have no project and which may be duplicates
3. Report the current state to the user and propose a cleanup plan
4. BoardMutate (action: update, projectId: ...) → attach orphans to a project
5. BoardMutate (action: delete)                 → remove canvases no longer needed
```

### Workflow 3: Find and View a Canvas

```
1. BoardQuery (mode: list, search: "keyword")   → search matching canvases
2. BoardQuery (mode: get, boardId: "...")       → fetch canvas detail (with nodes and edges)
3. Show the user a summary of the canvas content
```

## Key Decisions — And Why

### Where Does boardId Come From?

Check `pageContext.boardId` first (the canvas the user is currently viewing). If there is no context, search with `BoardQuery (mode: list)` first. **Always confirm the correct boardId first.**

Operating on the wrong canvas **silently corrupts data** — concretely: nodes get added to the wrong canvas, the original canvas's edge relationships get polluted, and the canvas the user sees no longer matches what was actually modified. This kind of damage raises no error; the user may notice the content is scrambled much later, and because the operation has already been saved, **it cannot be recovered via undo** (only by restoring from backup or rebuilding after hard-delete). So "confirm the boardId first" is not flow-OCD — it's protection against irreversible data confusion.

### delete vs hard-delete

Default to delete (soft delete, recoverable). Users change their minds all the time. Only use hard-delete when the user explicitly says "wipe it", "permanently delete".

### clear-unbound Demands Extreme Caution

It deletes every canvas not attached to a project in one shot. Before running it, you **must** first call `BoardQuery (mode: list, unboundOnly: true)` and have the user confirm the list, to avoid accidentally nuking valuable standalone canvases.

### Always Confirm Before Deleting

Before any delete, hard-delete, or clear-unbound operation, show the user the list of canvases that will be affected. This follows the same principle as confirming recipients before sending an email — irreversible operations need a human in the loop.
