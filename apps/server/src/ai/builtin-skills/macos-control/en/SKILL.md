---
name: macos-control-skill
description: >
  Triggered when the user asks the AI to directly operate their macOS desktop: open an app, click a button, fill a form inside a native window, read what's currently on screen, automate a local GUI flow. Typical phrasing: "in Finder, please…", "click X in the Y app", "what's on my screen right now". **Available only in OpenLoaf Desktop (macOS)**; other platforms return a desktop-only error — fall back to `BrowserAct` or hand the task back to the user. **Not for**: in-page web interaction (→ `browser-ops-skill`), local file I/O (→ `Read`/`Edit`/`Write`).
---

# macOS Desktop Control Guide

## Tool Inventory

| Tool | Purpose | Read-only |
|------|---------|-----------|
| `MacosObserve` | Screenshot + dump of the foreground app's Accessibility tree (role / title / frame / path per node) | Yes |
| `MacosAct` | Single-step action: click / type / key / scroll / drag / wait / ax_action | No |

> **Loading**: Both are deferred — call `ToolSearch(names: "MacosObserve,MacosAct")` to activate schemas first.
> **Platform**: macOS desktop only; on other platforms the tools are not registered and return a desktop-only error — stop immediately.

## Core Mental Model

Desktop control = **observe-act-verify** loop. After every `MacosAct` you must call `MacosObserve` again, because the UI is stateful: a click may trigger a popup, page switch, or focus change, and you cannot predict the outcome. Blindly chaining acts is the single most common failure mode.

```
MacosObserve → analyze AX tree → MacosAct → MacosObserve → ...
```

## Permissions

First call will likely report missing permissions. **When the tool returns `macOS permission missing: ...`, the server has already opened the corresponding System Settings pane for the user.** What you must do:

1. Tell the user in natural language: "I've opened 'System Settings → Privacy & Security → {pane}' for you. Please enable OpenLoaf there, then tell me to continue."
2. **Do not** retry observe/act repeatedly on your own. Wait for user confirmation.
3. Permissions involved:
   - `screen`: Screen Recording (screenshots)
   - `accessibility`: Accessibility (read UI tree + synthetic input)
4. Some apps may still need OpenLoaf Desktop to be restarted after granting.

## MacosObserve Details

A single `MacosObserve` returns:

- **Screenshot attachment**: PNG of the foreground screen, automatically injected as a multimodal image — you can "see" it directly
- **Foreground app info**: `name`, `bundleId`
- **AX tree (JSON)**: each node includes `role` / `title` / `value` / `identifier` / `frame: {x,y,w,h}` / `path: [...]` / `children`
- **Budget**: defaults to `maxNodes: 1500`, `maxDepth: 4`; on overflow the response carries `truncated: true`

**Parameters**:
- `appFilter` (optional): filter by app name; omitted → foreground app
- `maxNodes` / `maxDepth`: shrink budget to save tokens
- `includeScreenshot: false`: AX tree only, no image (rarely needed)

## MacosAct Action Set

| type | Usage | When |
|------|-------|------|
| `click` | Click. Prefer `ref` (AX reference); fall back to `point: {x,y}` | Most interactions |
| `type` | Type text at current focus | After focusing an input |
| `key` | Send a key combo (`cmd+space`, `return`, `escape`, …) | Shortcuts, submit, cancel |
| `scroll` | Scroll `dx/dy` at `point` | Content off-viewport |
| `drag` | Drag from `from` to `to` | Drag-drop, selection |
| `wait` | Sleep `ms` milliseconds (≤10000) | Rarely — next observe usually suffices |
| `ax_action` | Execute a named AX action on a node (`AXPress`, `AXShowMenu`, …) | Prefer when the AX node supports it — more robust than coordinate click |

## Prefer AX ref Over Coordinates

**Iron rule**: if `ref` works, don't use `point`. A moved window breaks coordinates; `ref` re-resolves against the current AX path / identifier.

```json
// Good
{ "type": "click", "ref": { "app": "Finder", "path": ["AXWindow[0]", "AXSplitGroup", "AXList", "AXRow[2]"] } }

// Fallback
{ "type": "click", "point": { "x": 120, "y": 340 } }
```

`ref` takes two forms:
- `{ app, path: [...] }`: path from root to target, each segment `role` or `role[index]`
- `{ identifier: "..." }`: most stable when the node exposes an AX identifier

## Core Workflows

### Workflow 1: Open an App and Operate

1. `MacosAct { key: ["cmd","space"] }` to open Spotlight
2. `MacosAct { type: "Finder" }` / `MacosAct { key: ["return"] }`
3. `MacosObserve` to confirm Finder is up + capture AX tree
4. Locate target node → `MacosAct { ax_action: "AXPress", ref: ... }`
5. `MacosObserve` to verify

### Workflow 2: Read Current Screen Content

User asks "what's on my screen", "what does the xx field in current app say": a single `MacosObserve`, extract the answer from screenshot + AX tree. **Do not** take extra screenshots for this.

### Workflow 3: Fill a Native Window Form

1. `MacosObserve` to find input nodes
2. `MacosAct { click, ref }` to focus
3. `MacosAct { type: "..." }` to input
4. Repeat per field
5. `MacosAct { ax_action: "AXPress", ref: <submit button> }`
6. `MacosObserve` to confirm result

## Safety and Privacy

- **Do not screenshot or act on password / banking / keychain apps.** If 1Password / Keychain / a banking app is in foreground, stop and hand off to the user.
- Screenshots live in the session asset directory, cleaned up with the session; **never uploaded to cloud, never used for training**.
- If you don't know the current screen state when answering, observe once first — **do not guess**.

## Error Diagnosis

- **`permissionsMissing`** → settings pane already opened; prompt user to grant and wait
- **`desktop-only`** → not running desktop; tell user to switch to OpenLoaf Desktop or propose a different path (e.g. browser automation)
- **AX ref resolution fails** → re-observe for a fresh path; the old one may have expired
- **Click has no effect** → is the node actually clickable? check if AX `role` is `AXButton`/`AXMenuItem`; is it occluded? → re-observe
- **Foreground app changed mid-sequence** → observe's app ≠ act's app; send `key cmd+tab` to restore focus before acting

## Iron Rules

1. **Observe after every act to verify**
2. **Prefer AX ref, fall back to coordinates**
3. **On missing permission stop immediately and prompt user — do not retry**
4. **Stop when a sensitive app (password manager, banking) is in foreground**
5. **A single observe is usually enough — don't over-screenshot**
6. **On non-desktop, return desktop-only at once; switch to browser tools or hand back to user**
