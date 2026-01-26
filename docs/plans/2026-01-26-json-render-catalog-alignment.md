# Json Render Catalog Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align json-render usage with the official Quick Start by defining a catalog, generating the system prompt, and rendering UI with the official providers.

**Architecture:** Introduce a shared json-render catalog (form + layout components) and generate `systemPrompt` from it for sessionPreface injection. Update the frontend renderer to use official @json-render/react providers and registry keys that match the catalog components, while preserving approval submission flow.

**Tech Stack:** Next.js/React, @json-render/core, @json-render/react, Zod, AI SDK v6.

**Project Note:** Skip TDD tests per project rules.

### Task 1: Add json-render catalog + system prompt export

**Files:**
- Create: `packages/api/src/jsonRenderCatalog.ts`
- Modify: `packages/api/package.json`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

```ts
// packages/api/src/jsonRenderCatalog.ts
import { createCatalog, generateCatalogPrompt } from "@json-render/core";
import { z } from "zod";

export const jsonRenderCatalog = createCatalog({
  components: {
    Card: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
      }),
      hasChildren: true,
    },
    Section: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
      }),
      hasChildren: true,
    },
    Form: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
      }),
      hasChildren: true,
    },
    Text: {
      props: z.object({
        content: z.string(),
      }),
    },
    TextField: {
      props: z.object({
        label: z.string().optional(),
        placeholder: z.string().optional(),
        helperText: z.string().optional(),
        name: z.string().optional(),
        path: z.string().optional(),
        required: z.boolean().optional(),
        inputType: z.enum(["text", "email", "password", "number", "tel", "url"]).optional(),
      }),
    },
    TextArea: {
      props: z.object({
        label: z.string().optional(),
        placeholder: z.string().optional(),
        helperText: z.string().optional(),
        name: z.string().optional(),
        path: z.string().optional(),
        required: z.boolean().optional(),
        rows: z.number().int().min(1).max(20).optional(),
      }),
    },
    Button: {
      props: z.object({
        label: z.string(),
        action: z.string(),
        params: z.object({}).catchall(z.unknown()).optional(),
      }),
    },
  },
  actions: {
    submit: { params: z.object({}).catchall(z.unknown()).optional() },
    cancel: { params: z.object({}).catchall(z.unknown()).optional() },
  },
});

export const jsonRenderSystemPrompt = generateCatalogPrompt(jsonRenderCatalog);
```

```json
// packages/api/package.json
{
  "dependencies": {
    "@json-render/core": "^0.3.0"
  }
}
```

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add packages/api/src/jsonRenderCatalog.ts packages/api/package.json
git commit -m "feat(api): add json-render catalog and system prompt"
```

### Task 2: Inject json-render system prompt into session preface

**Files:**
- Modify: `apps/server/src/ai/domain/services/prefaceBuilder.ts`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

```ts
import { jsonRenderSystemPrompt } from "@tenas-ai/api/jsonRenderCatalog";

// ...
const sections = [
  // existing sections...
  "## json-render catalog prompt",
  jsonRenderSystemPrompt,
];
```

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add apps/server/src/ai/domain/services/prefaceBuilder.ts
git commit -m "feat(server): include json-render prompt in session preface"
```

### Task 3: Align json-render UI renderer with catalog + providers

**Files:**
- Modify: `apps/web/src/components/chat/message/tools/JsonRenderTool.tsx`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

```tsx
import {
  DataProvider,
  VisibilityProvider,
  ActionProvider,
  Renderer,
  useDataBinding,
  type ComponentRegistry,
  type ComponentRenderProps,
} from "@json-render/react";

// Registry uses catalog keys: Card, Section, Form, Text, TextField, TextArea, Button
```

- Use `DataProvider` with `initialData` and a `key` for rehydration.
- Wrap `VisibilityProvider` + `ActionProvider` around `Renderer`.
- Ensure `TextField`/`TextArea` call `handleDataChange(path, value)` on change to keep approval payload in sync.
- Add simple `Card`/`Section`/`Text` renderers for layout + content.
- Keep readOnly/approval behavior and submit hiding consistent with current flow.

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add apps/web/src/components/chat/message/tools/JsonRenderTool.tsx
git commit -m "feat(web): align json-render UI with catalog providers"
```

### Task 4: Update lockfile after dependency change

**Files:**
- Modify: `pnpm-lock.yaml`

**Step 1: (Skipped) Write the failing test**

Skipped per project rule.

**Step 2: (Skipped) Run test to verify it fails**

Skipped per project rule.

**Step 3: Write minimal implementation**

Run:

```bash
pnpm install
```

**Step 4: (Skipped) Run tests to verify they pass**

Skipped per project rule.

**Step 5: Commit**

```bash
git add pnpm-lock.yaml
git commit -m "chore: update lockfile for json-render catalog"
```
