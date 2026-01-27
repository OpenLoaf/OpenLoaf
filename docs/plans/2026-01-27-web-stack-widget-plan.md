# Web Stack Desktop Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a desktop web stack widget that captures site metadata/logo/preview, stores assets under `.tenas/desktop`, and opens the page on click.

**Architecture:** The renderer calls a single web-meta client. In Electron it uses IPC to capture favicon and screenshot; in browser it calls a server tRPC router that fetches metadata and generates a preview. Both return a unified payload stored on the desktop item.

**Tech Stack:** Next.js (apps/web), Hono + tRPC (apps/server + packages/api), Electron IPC (apps/electron), Tailwind UI.

> 注意：根据项目规则，使用 superpowers 技能时跳过 TDD，不写/不跑测试用例。仅做类型检查或手动验证。

---

### Task 1: Extend desktop widget types and persistence

**Files:**
- Modify: `apps/web/src/components/desktop/types.ts`
- Modify: `apps/web/src/components/desktop/desktop-persistence.ts`

**Step 1: Add web widget fields/types**
- In `apps/web/src/components/desktop/types.ts`, add `"web-stack"` to `DesktopWidgetItem["widgetKey"]`.
- Add optional fields to `DesktopWidgetItem`:
  - `webUrl?: string`
  - `webTitle?: string`
  - `webDescription?: string`
  - `webLogo?: string` (relative path under `.tenas/desktop`)
  - `webPreview?: string` (relative path under `.tenas/desktop`)
  - `webMetaStatus?: "idle" | "loading" | "ready" | "failed"`

**Step 2: Persist web widget params**
- In `apps/web/src/components/desktop/desktop-persistence.ts`, extend `DesktopFileItem` params for `web-stack`.
- Serialize: map fields into `params` for `web-stack`.
- Deserialize: restore `webUrl`, `webTitle`, `webDescription`, `webLogo`, `webPreview`, `webMetaStatus`.

**Step 3: Type check locally (optional)**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

**Step 4: Commit**
```bash
git add apps/web/src/components/desktop/types.ts apps/web/src/components/desktop/desktop-persistence.ts
git commit -m "feat(desktop): add web widget metadata fields"
```

---

### Task 2: Add web-meta API definitions (tRPC)

**Files:**
- Create: `packages/api/src/routers/absWebMeta.ts`
- Modify: `packages/api/src/index.ts`

**Step 1: Define schema and base router**
- Create `packages/api/src/routers/absWebMeta.ts` with zod schemas:
  - input: `{ url: string, rootUri?: string }`
  - output: `{ ok: boolean, url: string, title?: string, description?: string, logoPath?: string, previewPath?: string }`
- Export `webMetaRouter`, `BaseWebMetaRouter`, `webMetaSchemas`.

**Step 2: Register router in api index**
- Add `webMeta` to `appRouterDefine` in `packages/api/src/index.ts`.
- Export `BaseWebMetaRouter` and `webMetaSchemas`.

**Step 3: Commit**
```bash
git add packages/api/src/routers/absWebMeta.ts packages/api/src/index.ts
git commit -m "feat(api): add web meta router schemas"
```

---

### Task 3: Implement server web-meta router (non-Electron path)

**Files:**
- Create: `apps/server/src/routers/webMeta.ts`
- Modify: `apps/server/src/bootstrap/createApp.ts`
- (Optional) Create: `apps/server/src/routers/webMetaHelpers.ts`

**Step 1: Implement metadata + screenshot capture**
- In `apps/server/src/routers/webMeta.ts`, implement tRPC router using `webMetaSchemas`:
  - Fetch metadata using existing link preview logic (extract title/description/icon URL). If reuse is needed, extract helpers into `apps/server/src/routers/webMetaHelpers.ts`.
  - Generate preview screenshot using `playwright-core` (launch Chromium, `page.goto`, `page.screenshot`).
  - Save assets under `.tenas/desktop/<hash>/logo.png` and `preview.jpg`.
  - Use `resolveFilePathFromUri` to resolve `rootUri` to local path.
  - On failure, return `ok: false` but still return `url` and any partial metadata.

**Step 2: Register router**
- In `apps/server/src/bootstrap/createApp.ts`, add `webMeta: webMetaRouterImplementation` into tRPC router map.

**Step 3: Manual sanity check**
- Run: `pnpm -C apps/server check-types`
- Expected: no TypeScript errors.

**Step 4: Commit**
```bash
git add apps/server/src/routers/webMeta.ts apps/server/src/bootstrap/createApp.ts
# Include helper if created
# git add apps/server/src/routers/webMetaHelpers.ts

git commit -m "feat(server): add web meta router"
```

---

### Task 4: Add Electron IPC for web-meta capture

**Files:**
- Create: `apps/electron/src/main/ipc/captureWebMeta.ts`
- Modify: `apps/electron/src/main/ipc/index.ts`
- Modify: `apps/electron/src/preload/index.ts`
- Modify: `apps/web/src/types/electron.d.ts`

**Step 1: Implement capture helper**
- `apps/electron/src/main/ipc/captureWebMeta.ts`:
  - Create hidden `BrowserWindow` (show: false), load URL.
  - Listen for `did-finish-load` then `capturePage()` for preview.
  - Listen for `page-favicon-updated` to capture favicon URL.
  - Fetch favicon data and write to `.tenas/desktop/<hash>/logo.png`.
  - Save preview to `.tenas/desktop/<hash>/preview.jpg`.
  - Return `{ ok, url, title, description, logoPath, previewPath }`.
  - 逻辑注释使用中文；函数注释使用英文。

**Step 2: Wire IPC**
- In `apps/electron/src/main/ipc/index.ts`, add handler `tenas:web-meta:fetch` calling `captureWebMeta`.

**Step 3: Expose to renderer**
- In `apps/electron/src/preload/index.ts`, add `fetchWebMeta` method.
- In `apps/web/src/types/electron.d.ts`, add typing for `fetchWebMeta`.

**Step 4: Commit**
```bash
git add apps/electron/src/main/ipc/captureWebMeta.ts apps/electron/src/main/ipc/index.ts apps/electron/src/preload/index.ts apps/web/src/types/electron.d.ts
git commit -m "feat(electron): add web meta capture IPC"
```

---

### Task 5: Add web-meta client in web app

**Files:**
- Create: `apps/web/src/components/desktop/webMetaClient.ts`

**Step 1: Implement client selector**
- In `apps/web/src/components/desktop/webMetaClient.ts`:
  - Use `window.tenasElectron?.fetchWebMeta` if available.
  - Otherwise call tRPC `webMeta.capture`.
  - Normalize payload, ensure `logoPath`/`previewPath` are relative paths.

**Step 2: Commit**
```bash
git add apps/web/src/components/desktop/webMetaClient.ts
git commit -m "feat(web): add web meta client"
```

---

### Task 6: Add WebStackWidget component

**Files:**
- Create: `apps/web/src/components/desktop/widgets/WebStackWidget.tsx`
- Modify: `apps/web/src/components/desktop/DesktopTileContent.tsx`

**Step 1: Implement widget UI**
- `WebStackWidget.tsx` renders three modes based on `layout.w/h`:
  - `1x1`: logo + title
  - `h=1`: logo + title + description
  - `h>1`: preview image + overlay info
- Provide click action to open URL using `BROWSER_WINDOW_COMPONENT` + `createBrowserTabId` (same pattern as `OpenUrlTool.tsx`).
- Use `normalizeUrl` from `apps/web/src/components/browser/browser-utils.ts`.

**Step 2: Render in DesktopTileContent**
- Add widgetKey branch for `web-stack` and pass `item` + `layout` to component.

**Step 3: Commit**
```bash
git add apps/web/src/components/desktop/widgets/WebStackWidget.tsx apps/web/src/components/desktop/DesktopTileContent.tsx
git commit -m "feat(desktop): add web stack widget renderer"
```

---

### Task 7: Add widget to catalog + library panel + creation flow

**Files:**
- Modify: `apps/web/src/components/desktop/widget-catalog.ts`
- Modify: `apps/web/src/components/desktop/DesktopWidgetLibraryPanel.tsx`
- Modify: `apps/web/src/components/desktop/DesktopEditToolbar.tsx`

**Step 1: Catalog entry**
- Add `web-stack` entry with default size (e.g. 4x2) and constraints `minW=1,minH=1,maxW=4,maxH=4`.

**Step 2: Library panel dialog**
- Add a small dialog/form to collect URL + 名称.
- On submit: call `webMetaClient`, then emit `DESKTOP_WIDGET_SELECTED_EVENT` with extra payload fields (`webUrl`, `webTitle`, `webDescription`, `webLogo`, `webPreview`).

**Step 3: Create widget item**
- In `DesktopEditToolbar.tsx`, extend `createWidgetItem` to accept web fields in options and set `webMetaStatus`.

**Step 4: Commit**
```bash
git add apps/web/src/components/desktop/widget-catalog.ts apps/web/src/components/desktop/DesktopWidgetLibraryPanel.tsx apps/web/src/components/desktop/DesktopEditToolbar.tsx
git commit -m "feat(desktop): add web stack widget creation flow"
```

---

### Task 8: Manual validation

**Files:**
- None (manual run)

**Step 1: Dev sanity**
- Run: `pnpm dev:web`
- Add widget, verify three sizes and click-to-open behavior.

**Step 2: Electron sanity (if available)**
- Run Electron app; verify IPC path works and assets saved under `.tenas/desktop`.

**Step 3: Type check**
- Run: `pnpm check-types`
- Expected: no TypeScript errors.

---

## Notes & Conventions

- 重要逻辑添加中文注释；方法/字段注释使用英文。
- 文件命名遵循规则：React 组件 PascalCase，工具/函数模块 camelCase。
- `.tenas/desktop` 目录由 rootUri 决定：优先 project root，否则 workspace root。

