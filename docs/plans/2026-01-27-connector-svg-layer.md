# Connector SVG Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render connectors (and their hover/selection states) with an SVG layer like React Flow, while keeping the existing WebGPU connector code intact for quick rollback.

**Architecture:** Add an SVG overlay that computes connector paths from the same engine data, renders paths with configurable stroke widths, and uses snapshot state for hover/selection styling. Gate GPU connector rendering with a flag so we can switch between SVG and GPU without deleting code.

**Tech Stack:** React, Next.js, WebGPU worker, SVG, existing board engine utilities.

### Task 1: Add SVG connector layer component

**Files:**
- Create: `apps/web/src/components/board/render/SvgConnectorLayer.tsx`

**Step 1: Implement SVG overlay scaffolding**

- Render an absolutely positioned `<svg>` that matches viewport size.
- Apply viewport transform (translate + scale) to a `<g>` so paths use world coordinates.

**Step 2: Build connector path data**

- For each connector in `snapshot.elements`, resolve endpoints with `resolveConnectorEndpointsSmart`.
- Convert `buildConnectorPath` output into SVG `d` strings (polyline or bezier).
- Include connector draft (`snapshot.connectorDraft`) in the render list.

**Step 3: Render visual + hit paths**

- Visual path: `strokeWidth=2.5`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
- Selected path: `strokeWidth=4` and `stroke` from `--canvas-connector-selected`.
- Hover path: `strokeWidth` slightly above default (e.g. 3) and `stroke` from `--canvas-connector-selected` with lower opacity.
- Hit path: optional transparent path with wider `strokeWidth` (e.g. 8) if we decide to use pointer-events later.

**Step 4: Manual verification**

- Run `pnpm dev:web` and confirm connectors render with correct widths.
- Verify selected connector appears thicker and more visible.
- Verify connector draft still appears while linking.

### Task 2: Wire SVG layer into board render flow

**Files:**
- Modify: `apps/web/src/components/board/core/BoardCanvasRender.tsx`

**Step 1: Add feature flag**

- Add a local `const useSvgConnectors = true;` (temporary flag).
- Render `<SvgConnectorLayer />` between `<CanvasSurface />` and `<CanvasDomLayer />` when enabled.

**Step 2: Manual verification**

- Ensure connectors show above GPU surface but below DOM nodes/overlays.
- Verify selection toolbar, inspector, and connector action panel still appear above connectors.

### Task 3: Gate GPU connector rendering (keep code)

**Files:**
- Modify: `apps/web/src/components/board/render/CanvasSurface.tsx`
- Modify: `apps/web/src/components/board/render/webgpu/gpu-protocol.ts`
- Modify: `apps/web/src/components/board/render/webgpu/board-renderer.worker.ts`

**Step 1: Add renderConnectors flag to GPU view message**

- Extend `GpuViewMessage` with `renderConnectors?: boolean` (default true).
- In `CanvasSurface`, pass `renderConnectors: !useSvgConnectors` into the `view` message.

**Step 2: Respect renderConnectors in worker**

- Store `renderConnectors` in `ViewState`.
- Skip `appendConnectorLines` when `renderConnectors` is false.
- Keep all existing GPU connector code intact for rollback.

**Step 3: Manual verification**

- Confirm no double-rendered connectors when SVG mode is on.
- Toggle flag to ensure GPU connectors can be restored.

### Task 4: Optional color alignment (if needed)

**Files:**
- Modify: `apps/web/src/index.css`

**Step 1: Ensure CSS vars match desired selection color**

- Align `--canvas-connector-selected` with the new selected color if needed.

---

**Notes:**
- Per project rule, skip TDD and do not create a worktree.
- Preserve all existing GPU connector rendering code for rollback.

