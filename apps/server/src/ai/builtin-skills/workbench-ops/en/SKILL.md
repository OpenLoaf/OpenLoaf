---
name: workbench-ops-skill
description: >
  Triggered when the user wants to add, modify, view, or delete widgets (desktop components / mini apps / dashboard cards) on the OpenLoaf workbench / desktop. Typical phrasings: "add a weather widget", "build a pomodoro component", "change the color of this widget". **Not for**: one-off chart rendering inside a chat message (→visualization-ops-skill), AI image generation (→cloud-media-skill), casually mentioning "clock / countdown" in conversation (→answer directly).
---

# Workbench Widget Management

This skill handles widget lifecycle management (scaffolding, querying, compile verification). Coding details (SDK API, component authoring, security sandbox) live in the `generate-dynamic-widget` skill — when you need to write code, first `LoadSkill(skillName: "generate-dynamic-widget")`.

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `WidgetInit` | Generate the widget scaffold directory (`~/.openloaf/dynamic-widgets/<id>/`) | No |
| `WidgetList` | List all created widgets | Yes |
| `WidgetGet` | Read details of a single widget | Yes |
| `WidgetCheck` | Compile widget (TypeScript) + trigger live preview refresh | Yes |
| `GenerateWidget` | Widget code generation (see `generate-dynamic-widget` skill) | No |
| `Read` | Widget code reading (always-available tool) | Yes |
| `Edit` | Widget code editing (always-available tool) | No |

> **Loading**: `Read` / `Edit` are always available; `WidgetInit` / `WidgetList` / `WidgetGet` / `WidgetCheck` / `GenerateWidget` must be activated via `ToolSearch(names: "WidgetInit,WidgetList,WidgetGet,WidgetCheck,GenerateWidget")` before calling, to load their schemas.

## Decision Tree

```
User wants a Widget
├── Does one already exist?
│   ├── Yes → WidgetList → WidgetGet → Read → understand the current state
│   │        └── Needs code changes → ToolSearch(names: "generate-dynamic-widget")
│   │        └── Edit → WidgetCheck
│   └── No → Create a new Widget (see flow below)
└── Just querying / browsing?
    └── WidgetList / WidgetGet is enough
```

## Modify vs Rebuild Decision

When the user wants to change an existing Widget:

- **Modify existing** (Edit): user says "add an X feature", "change the color", "show one more field" → incremental edit on existing code
- **Recreate** (WidgetInit): fundamental change, e.g. from "weather component" to "stock ticker", or a completely different overall architecture / layout → create a new Widget to replace it

## Creating a New Widget (must follow this order)

1. **`WidgetInit`** — generate the scaffold directory
   - Why init first? Because it creates the correct directory structure (`~/.openloaf/dynamic-widgets/<id>/`), package.json, and type stub files. Skipping this and writing files directly will cause the compiler to fail to find type definitions.
2. **`ToolSearch(names: "generate-dynamic-widget")`** — load the coding conventions
3. **`Write`** — write widget.tsx (the frontend component)
4. **`Write`** — write functions.ts (server-side functions, if needed)
5. **`WidgetCheck`** — compile + trigger live preview
   - Why must check run last? Because it runs the TypeScript compile and notifies the frontend to refresh the preview. Without calling check, the user still sees the old content.

## Modifying an Existing Widget

1. `WidgetList` → `WidgetGet` → `Read` — locate and read the source
2. `Edit` — precise search-and-replace modification
3. `WidgetCheck` — verify via compile

## Recovering from WidgetCheck Compile Failures

When `WidgetCheck` returns compile errors:

1. **Read the error** — focus on the TypeScript error line number and description
2. **Common errors and fixes**:
   - `Cannot find module 'xxx'` → widget.tsx may only import `react`, `react/jsx-runtime`, `@openloaf/widget-sdk`; remove the forbidden import
   - `Type 'xxx' is not assignable` → check SDK type definitions and confirm props/state types match
   - `JSX element type does not have any construct` → check that the component export is correct (must be `export default`)
3. **Fix with `Edit`** → run `WidgetCheck` again, repeat until compile passes

## Widget Capability Boundaries

**Good fits**:
- Data display (charts, stat cards, lists)
- Simple interactions (buttons, toggles, input fields)
- Scheduled polling of APIs for data (via functions.ts server-side functions)
- Static or low-frequency content (weather, calendar, todo, clock, pomodoro)

**Poor fits**:
- Complex multi-page flows (use a standalone page instead)
- Heavy computation (server-side functions have a 10-second timeout)
- Real-time WebSocket long connections (not supported by the sandbox)
- Operations needing local filesystem access (isolated by the security sandbox)

## Key Constraints

- Widget code directory: `~/.openloaf/dynamic-widgets/<widget-id>/`
- `widget.tsx` may only import: `react`, `react/jsx-runtime`, `@openloaf/widget-sdk`
- `functions.ts` executes on the Server side with a 10-second timeout
- Sensitive information (API keys, etc.) is injected via `.env` under the widget directory — never hardcode
