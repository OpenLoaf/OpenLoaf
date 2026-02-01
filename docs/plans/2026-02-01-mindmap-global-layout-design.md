## Global Mindmap Layout Design

### Goals
- Provide an AFFiNE-like mindmap experience directly on the canvas without introducing new node types.
- Use existing nodes/connectors, with global tree layout derived from connector direction.
- Support keyboard creation (Tab/Enter/Shift+Tab) for text nodes, collapse/expand, and branch color inheritance.
- Allow users to manually change connector colors via the connector action panel.
- Prevent cyclic connections with a user-facing toast.

### Scope
- Global tree layout applied to all nodes based on connector direction (source -> target).
- Text nodes can change parent by dragging onto another node.
- Connector color stored on the connector element and rendered directly.
- Collapse/expand with a count-only ghost node as the affordance.

### Out of Scope
- Introducing a dedicated mindmap node or group type.
- Changing connector style automatically (dash/solid). Users can change style manually.
- Free-form layout while in mindmap mode (layout stays authoritative).

### Data Model Changes
- `CanvasConnectorElement` adds `color?: string`.
- `CanvasNodeElement.meta.branchColor?: string` for default child connector color.
- `CanvasNodeElement.meta.collapsed?: boolean` for subtree collapse state.
- Ghost node uses `CanvasNodeElement` with `meta.mindmapGhost = true` and `meta.ghostFor = <nodeId>`.

### Tree Rules
- Parent/child is defined by connector direction: source = parent, target = child.
- Root nodes are those with no inbound connectors.
- Multi-parent nodes are treated as **new roots** for layout purposes. Their inbound edges remain, but they do not participate in collapse.
- Cycles are forbidden. Any connector creation or endpoint edit that would create a cycle is blocked and shows a toast.

### Layout
- Use a tree layout similar to AFFiNE: rightward by default, with toolbar toggle for left / balanced.
- Vertical spacing is computed by subtree height; horizontal spacing is fixed by layout constants.
- Layout runs after: connector create/update, node create/delete, collapse/expand, or parent change.
- Layout is authoritative: positions of participating nodes are updated in a batch transaction.

### Interaction
- **Tab** (text nodes only): create child text node; auto-connect and enter edit mode.
- **Enter** (text nodes only): create sibling text node (same parent) and connect.
- **Shift+Tab** (text nodes only): promote to parent of current parent (if any).
- **Backspace** on empty text: delete node; children reattach to the deleted node's parent when possible.
- **Drag-to-parent**: dragging a text node onto another node reassigns its parent (non-text nodes do not reparent by drag).

### Collapse / Expand
- Collapsed nodes hide their entire subtree (no render, hit testing, or layout participation).
- A ghost node showing only the child count (`+N`) appears to the right of the collapsed node.
- Clicking the ghost node expands the subtree and removes the ghost.
- Multi-parent nodes do not show collapse controls and do not generate ghost nodes.

### Connector Color
- Default connector color is inherited from the parent node's branch color.
- When a connector is manually recolored, the custom color is stored on the connector and takes priority.
- Node branch color can be derived from the connector color of its inbound edge when created.

### UI Changes
- Connector action panel adds a color picker (simple swatches) for manual color override.
- Connector rendering uses `connector.color` when present.
- Toast message is shown when a cycle is blocked.

### Key Files
- `apps/web/src/components/board/engine/types.ts` (connector color)
- `apps/web/src/components/board/render/SvgConnectorLayer.tsx` (render color)
- `apps/web/src/components/board/ui/CanvasPanels.tsx` (connector color UI)
- `apps/web/src/components/board/tools/SelectTool.ts` (keyboard + drag parent change)
- `apps/web/src/components/board/engine/CanvasEngine.ts` (layout + cycle prevention)
- `apps/web/src/components/board/engine/mindmap-layout.ts` (new layout module)

### Error Handling
- Block cyclic connectors with a toast and no document mutation.
- Skip invalid connectors or missing nodes during layout.
- Delete orphaned ghost nodes if their target is missing.

### Verification
- Not requested.
