# Auto Layout Design (Board)

## Goal
Provide a global auto-layout action from the left toolbar. When triggered, the board repositions all nodes to reduce connector crossings and align flow direction. Locked nodes remain fixed. Group nodes move as a whole; their internal layout is preserved.

## Scope
- Apply to the entire board.
- Auto-detect layout direction (left-to-right vs top-to-bottom).
- Only move node positions; do not change sizes or connectors.
- Respect locked nodes and group boundaries.

## Architecture
- Implement a new layout module under `apps/web/src/components/board/` as a standalone component file. The module exposes a pure function that computes new positions based on the current document state.
- The toolbar action calls CanvasEngine to invoke this module and apply results in a single transaction, then commits history.

## Data Flow
1. Collect nodes and connectors from the document.
2. Mark locked nodes as fixed anchors.
3. Collapse groups into “super nodes” (group bounds + child ids), preserving internal offsets.
4. Build a directed graph from connectors: source → target.
5. Auto-detect primary layout direction.
6. Assign layers, order nodes within layers, compute positions.
7. Expand group nodes back to children using the computed delta.
8. Output position updates and apply them.

## Direction Detection
- Compute the sum of absolute connector deltas: |dx| and |dy|.
- If sum |dx| >= sum |dy|, choose horizontal (left→right); otherwise vertical (top→bottom).

## Layer Assignment
- Use BFS/longest-path to assign layer indices.
- Handle cycles by temporarily ignoring the weakest edge in the cycle.
- Fixed nodes keep their layer index and position as anchors.

## In-Layer Ordering
- Use barycenter ordering to reduce crossings.
- Run 2–3 forward/backward passes.
- Locked nodes keep their order; other nodes reflow around them.

## Positioning Rules
- `layerGap = 240`, `nodeGap = 32` (configurable constants).
- Horizontal: layers are columns; nodes in a layer are stacked vertically.
- Vertical: layers are rows; nodes in a layer are stacked horizontally.
- Locked nodes: keep absolute position; other nodes avoid their occupied span.
- Group nodes: move as a whole; internal children keep relative positions.

## Constraints
- Do not resize nodes.
- Do not change connector endpoints or styles.
- If layout fails, fall back to a single-layer layout with uniform spacing.

## Complexity
- Layering: O(N + E)
- Ordering: O(k * N * deg) with small k (2–3)

## UI Integration
- Add a toolbar button labeled “Auto Layout”.
- Clicking runs the layout and commits history.

## Testing
- Manual validation on boards with:
  - mixed direction edges
  - multiple outputs from a single node
  - locked nodes
  - groups with children

