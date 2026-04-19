---
name: project-ops-skill
description: >
  Triggered when the user wants to create, open, switch, move, delete, rename, or add a sub-project to OpenLoaf's "project" entity. Typical phrasings: "new project", "add ~/code/foo", "list all projects". **Not for**: reading/writing files inside a project (→ use Read/Edit/Write directly), discussing "project planning / requirement docs" (→ answer directly), routine Git operations (→ `Bash`).
---

# Project Operations Guide

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `ProjectQuery` | Query project tree / single project details (mode: `list` / `get`) | Yes |
| `ProjectMutate` | Create / update / move / delete projects (action: `create` / `update` / `move` / `remove`) | No |
| `Read` / `Glob` / `Grep` | Read and search files within a project (always available) | Yes |
| `Edit` / `Write` | Edit / create files within a project (always available) | No |
| `Bash` | Run commands at the project root (Git, etc., always available) | No |

> **Loading**: `Read` / `Glob` / `Grep` / `Edit` / `Write` / `Bash` are core tools and always available; `ProjectQuery` / `ProjectMutate` must be activated with `ToolSearch(names: "ProjectQuery,ProjectMutate")` before calling to load their schemas.

## Decision Flow

```
User wants to operate on files
├─ Already in a project context? → Use file tools directly
└─ Not in a project context?
   ├─ Explicitly wants to create a project → ProjectMutate { action: "create" }
   └─ Casual "help me write a script" → System auto-creates a temporary project (see below)
```

## ProjectQuery

**list** — Project tree + flat list: `ProjectQuery { mode: "list" }`

**get** — Single project details (omit projectId to use the current context): `ProjectQuery { mode: "get" }`

## ProjectMutate

### create — Core Example

```
ProjectMutate { action: "create", title: "Q2 Marketing", folderName: "q2-marketing", icon: "📊", enableVersionControl: true }
```

**Pointing to an existing directory** — When the user provides a bare path, you must convert it to a `file://` protocol URI:
- User says `/Users/user/code/repo` → you pass `rootUri: "file:///Users/user/code/repo"`
- User says `~/my-project` → first expand `~`, then build `file:///Users/user/my-project`

**Creating a sub-project** — `ProjectMutate { action: "create", title: "Submodule", parentProjectId: "parent-id" }`
or under the current project: `{ action: "create", title: "Submodule", createAsChild: true }`

### When to Create Top-Level vs Sub-Project

- Independent repository, independent business line → **top-level project**
- Sub-package in a monorepo, auxiliary module of a parent project → **sub-project** (pass `parentProjectId`)
- User says "create under the current project" → use `createAsChild: true`

### folderName Decision

- User specified a folder name → use the user's
- Title is in Chinese or contains special characters → **must** specify an English `folderName` (disk-unfriendly characters cause problems)
- Title is concise English → can be omitted; the system auto-generates from the title

### enableVersionControl Decision

- Default `true`, suitable for code projects
- Pure docs, notes, temporary drafts → set `false` (avoid meaningless Git init)
- User is importing an existing Git repo (has rootUri) → set `false` (repo already has `.git`)

### update / move / remove

`update`: `ProjectMutate { action: "update", projectId: "xxx", title: "New Name", icon: "🚀" }`
`move`: `ProjectMutate { action: "move", projectId: "xxx", targetParentProjectId: "parent-id" }` (`null` = move to top level)
`remove`: `ProjectMutate { action: "remove", projectId: "xxx" }` — **only unregisters the record, does not touch files on disk**. The user's code and data are irreversible; disk contents are under the user's sovereignty.

## Temporary Projects

When a user requests file operations in a **global conversation** (not a project context), the system automatically creates a temporary project under `~/.openloaf/temp/`, transparent to the user.

| Attribute | Formal Project | Temporary Project |
|-----------|----------------|-------------------|
| Creation | `ProjectMutate { action: "create" }` | Auto-created by the system |
| Disk location | User-specified or default directory | `~/.openloaf/temp/{sessionId}/` |
| Lifecycle | Manually removed by user | Can be promoted to formal project, or cleaned up with the session |

## End-to-End Flows

**Exploring a project**: `ProjectQuery { mode: "get" }` → `Glob { pattern: "**/*" }` → `Grep` → `Read`

**Creating a project**: `ProjectQuery { mode: "list" }` → `ProjectMutate { action: "create", ... }` → `Write` initial files → `Bash` to install dependencies

## Common Mistakes and Guardrails

**Malformed rootUri** — Must use the `file://` protocol, e.g., `file:///Users/user/project`; bare paths are not allowed. The cross-platform URI standard requires the protocol prefix; bare paths will fail to parse. Remember: three slashes (`file:///`) = protocol `file://` + root path `/`. If the user wants to access a disk path outside the project directory, guide them to create a new project pointing to that directory — the sandbox cannot cross boundaries.

**Confusing remove with deletion** — `remove` only unregisters and does not touch disk, preventing accidental deletion of user code. If the user truly wants to delete files on disk, they must explicitly use `Bash rm -rf`.

**Forgetting to query first** — Before mutating, run `ProjectQuery` to confirm the projectId and current structure. projectIds are randomly generated; guessing and passing one will operate on the wrong project.
