/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type {
  CanvasAlignmentGuide,
  CanvasAnchorHit,
  CanvasConnectorDraft,
  CanvasConnectorDrop,
  CanvasConnectorElement,
  CanvasConnectorEnd,
  CanvasConnectorEndpointHit,
  CanvasConnectorEndpointRole,
  CanvasConnectorStyle,
  CanvasElement,
  CanvasInsertRequest,
  CanvasNodeDefinition,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSelectionBox,
  CanvasStrokePoint,
  CanvasStrokeSettings,
  CanvasStrokeTool,
  CanvasViewState,
  CanvasViewportState,
} from "../engine/types";
import type { ConnectionValidation } from "../engine/connection-validator";

export type CanvasToolSelectionHost = {
  /** Return the selected element ids. */
  getSelectedIds: () => string[];
  /** Replace the current selection. */
  setSelection: (selectionIds: string[]) => void;
  /** Toggle one id in the current selection. */
  toggle: (selectionId: string) => void;
  /** Clear the current selection. */
  clear: () => void;
  /** Return whether an id is currently selected. */
  isSelected: (selectionId: string) => boolean;
};

export type CanvasToolDocHost = {
  /** Return all canvas elements. */
  getElements: () => CanvasElement[];
  /** Return one element by id if present. */
  getElementById: (elementId: string) => CanvasElement | null | undefined;
  /** Update one element patch in-place. */
  updateElement: (elementId: string, patch: Partial<CanvasElement>) => void;
  /** Run a document transaction. */
  transact: (fn: () => void) => void;
  /** Query node candidates intersecting a rect. */
  getNodeCandidatesInRect: (rect: CanvasRect) => CanvasNodeElement[];
};

export type CanvasToolViewportHost = {
  /** Return the current viewport state. */
  getState: () => CanvasViewportState;
};

export type CanvasToolHost = {
  /** Selection API exposed to tools. */
  selection: CanvasToolSelectionHost;
  /** Document API exposed to tools. */
  doc: CanvasToolDocHost;
  /** Viewport API exposed to tools. */
  viewport: CanvasToolViewportHost;
  /** Return the canvas container. */
  getContainer: () => HTMLElement | null;
  /** Convert a screen-space point into world space. */
  screenToWorld: (point: CanvasPoint) => CanvasPoint;
  /** Switch the active tool id. */
  setActiveTool: (toolId: string) => void;
  /** Return whether the board is locked. */
  isLocked: () => boolean;
  /** Update the lock state. */
  setLocked: (locked: boolean) => void;
  /** Return whether single-select-only mode is active (disables box selection and shift-multi-select). */
  isSingleSelectOnly: () => boolean;
  /** Return whether snap guides are enabled. */
  isSnapEnabled: () => boolean;
  /** Return stroke settings for a drawing tool. */
  getStrokeSettings: (tool: CanvasStrokeTool) => CanvasStrokeSettings;
  /** Return the pending insert payload if present. */
  getPendingInsert: () => CanvasInsertRequest | null;
  /** Update the pending insert payload. */
  setPendingInsert: (request: CanvasInsertRequest | null) => void;
  /** Return whether the toolbar is currently dragging. */
  isToolbarDragging: () => boolean;
  /** Update the pending insert preview point. */
  setPendingInsertPoint: (point: CanvasPoint | null) => void;
  /** Track the actively dragged element id. */
  setDraggingElementId: (elementId: string | null) => void;
  /** Update the viewport panning state. */
  setPanning: (panning: boolean) => void;
  /** Update the viewport offset. */
  setViewportOffset: (offset: CanvasPoint) => void;
  /** Return combined view state. */
  getViewState: () => CanvasViewState;
  /** Return the active connector style. */
  getConnectorStyle: () => CanvasConnectorStyle;
  /** Update the active connector style. */
  setConnectorStyle: (
    style: CanvasConnectorStyle,
    options?: { applyToSelection?: boolean },
  ) => void;
  /** Return whether new connectors are dashed. */
  getConnectorDashed: () => boolean;
  /** Return the in-progress connector draft. */
  getConnectorDraft: () => CanvasConnectorDraft | null;
  /** Update the connector draft. */
  setConnectorDraft: (draft: CanvasConnectorDraft | null) => void;
  /** Update the hovered connector anchor. */
  setConnectorHover: (hit: CanvasAnchorHit | null) => void;
  /** Return the hovered connector anchor. */
  getConnectorHover: () => CanvasAnchorHit | null;
  /** Update the hovered node id. */
  setNodeHoverId: (elementId: string | null) => void;
  /** Return the hovered node id. */
  getNodeHoverId: () => string | null;
  /** Update the hovered connector id. */
  setConnectorHoverId: (connectorId: string | null) => void;
  /** Return the pending connector drop. */
  getConnectorDrop: () => CanvasConnectorDrop | null;
  /** Update the pending connector drop. */
  setConnectorDrop: (drop: CanvasConnectorDrop | null) => void;
  /** Update the connector drag validation result. */
  setConnectorValidation: (result: ConnectionValidation | null) => void;
  /** Return a node definition by type, or undefined if unknown. */
  getNodeDefinition: (type: string) => CanvasNodeDefinition<unknown> | undefined;
  /** Return the top-most node under the point. */
  findNodeAt: (point: CanvasPoint) => CanvasNodeElement | null;
  /** Return the nearest edge anchor hit for a node. */
  getNearestEdgeAnchorHit: (
    elementId: string,
    hint: CanvasPoint,
  ) => CanvasAnchorHit | null;
  /** Return the hovered edge anchor under the point. */
  findEdgeAnchorHit: (
    point: CanvasPoint,
    exclude?: { elementId: string; anchorId: string },
    selectedIds?: string[],
  ) => CanvasAnchorHit | null;
  /** Return a connector endpoint hit under the point. */
  findConnectorEndpointHit: (
    point: CanvasPoint,
    connectorIds?: string[],
  ) => CanvasConnectorEndpointHit | null;
  /** Update one connector endpoint. */
  updateConnectorEndpoint: (
    connectorId: string,
    role: CanvasConnectorEndpointRole,
    end: CanvasConnectorEnd,
  ) => void;
  /** Update the current alignment guides. */
  setAlignmentGuides: (guides: CanvasAlignmentGuide[]) => void;
  /** Update the rectangle selection box. */
  setSelectionBox: (box: CanvasSelectionBox | null) => void;
  /** Set the world-space point where the selection was clicked (for toolbar positioning). */
  setSelectionClickPoint: (point: CanvasPoint | null) => void;
  /** Update selection box and selection in one step. */
  setSelectionBoxAndSelection: (
    box: CanvasSelectionBox | null,
    selectionIds: string[],
  ) => void;
  /** Delete the current selection. */
  deleteSelection: () => void;
  /** Copy the current selection. */
  copySelection: () => void;
  /** Cut the current selection. */
  cutSelection: () => void;
  /** Move the current selection by a delta. */
  nudgeSelection: (dx: number, dy: number) => void;
  /** Group the current selection. */
  groupSelection: () => void;
  /** Ungroup the current selection. */
  ungroupSelection: () => void;
  /** Create a mindmap child for the given node. */
  createMindmapChild: (parentId: string) => string | null;
  /** Create a mindmap sibling for the given node. */
  createMindmapSibling: (nodeId: string) => string | null;
  /** Promote a mindmap node one level. */
  promoteMindmapNode: (nodeId: string) => void;
  /** Remove one mindmap node. */
  removeMindmapNode: (nodeId: string) => void;
  /** Reparent a mindmap node. */
  reparentMindmapNode: (nodeId: string, newParentId: string) => void;
  /** Add a new node element. */
  addNodeElement: (
    type: string,
    props: Record<string, unknown>,
    xywh?: [number, number, number, number],
    options?: { skipMindmapLayout?: boolean; skipHistory?: boolean },
  ) => string | null;
  /** Add a connector element. */
  addConnectorElement: (
    draft: CanvasConnectorDraft,
    options?: { skipHistory?: boolean; skipLayout?: boolean; select?: boolean },
  ) => void;
  /** Add a new stroke element. */
  addStrokeElement: (
    tool: CanvasStrokeTool,
    settings: CanvasStrokeSettings,
    point: CanvasStrokePoint,
  ) => string;
  /** Update one stroke element. */
  updateStrokeElement: (
    elementId: string,
    points: CanvasStrokePoint[],
    tool: CanvasStrokeTool,
    settings: CanvasStrokeSettings,
  ) => void;
  /** Erase stroke elements near a point. */
  eraseStrokesAt: (point: CanvasPoint, radius: number) => string[];
  /** Focus the viewport to fit all elements. */
  fitToElements: (padding?: number) => void;
  /** Trigger board auto layout. */
  autoLayoutBoard: () => void;
  /** Commit the current gesture into history. */
  commitHistory: () => void;
  /** Undo one history step. */
  undo: () => void;
  /** Redo one history step. */
  redo: () => void;
  /** Return the top-most element at the point. */
  pickElementAt: (point: CanvasPoint) => CanvasElement | null;
  /** Batch multiple updates into one notification. */
  batch: (fn: () => void) => void;
};

/** Tool context passed to tool handlers. */
export type ToolContext = {
  /** Engine instance for querying and updates. */
  engine: CanvasToolHost;
  /** Raw pointer event from the browser. */
  event: PointerEvent;
  /** Pointer position in screen space. */
  screenPoint: CanvasPoint;
  /** Pointer position in world space. */
  worldPoint: CanvasPoint;
};

/** Contract for canvas tools. */
export type CanvasTool = {
  /** Tool identifier. */
  id: string;
  /** Pointer down handler. */
  onPointerDown?: (ctx: ToolContext) => void;
  /** Pointer move handler. */
  onPointerMove?: (ctx: ToolContext) => void;
  /** Pointer up handler. */
  onPointerUp?: (ctx: ToolContext) => void;
  /** Keyboard handler. */
  onKeyDown?: (event: KeyboardEvent, engine: CanvasToolHost) => void;
};
