import type { ComponentType, ReactNode } from "react";
import type { ZodType } from "zod";
import type { BoardFileContext } from "../core/BoardProvider";

/** 2D point in canvas space. */
export type CanvasPoint = [number, number];

/** Rectangle represented by top-left x/y and width/height. */
export type CanvasRect = {
  /** Rect x position in world coordinates. */
  x: number;
  /** Rect y position in world coordinates. */
  y: number;
  /** Rect width in world coordinates. */
  w: number;
  /** Rect height in world coordinates. */
  h: number;
};

/** Shared element fields for all canvas entities. */
export type CanvasElementBase = {
  /** Element id used for references and selection. */
  id: string;
  /** Element type used to resolve renderers and behaviors. */
  type: string;
  /** Element position and size in world coordinates. */
  xywh: [number, number, number, number];
  /** Element rotation in degrees. */
  rotate?: number;
  /** Z index used for ordering. */
  zIndex?: number;
  /** Opacity from 0 to 1. */
  opacity?: number;
  /** Lock flag to disable interactive edits. */
  locked?: boolean;
  /** Custom metadata for business extensions. */
  meta?: Record<string, unknown>;
};

/** Canvas node element that hosts a React component. */
export type CanvasNodeElement<P = Record<string, unknown>> = CanvasElementBase & {
  /** Discriminator for DOM-rendered node elements. */
  kind: "node";
  /** Node-specific props stored in the document. */
  props: P;
};

/** Stroke point with optional pressure. */
export type CanvasStrokePoint = [number, number, number?];

/** Stroke tool identifier. */
export type CanvasStrokeTool = "pen" | "highlighter";

/** Stroke node type identifier. */
export const STROKE_NODE_TYPE = "stroke";

/** Stroke node props stored in the document. */
export type StrokeNodeProps = {
  /** Stroke tool type for rendering behavior. */
  tool: CanvasStrokeTool;
  /** Raw stroke points in node-local coordinates. */
  points: CanvasStrokePoint[];
  /** Stroke color in CSS format. */
  color: string;
  /** Stroke size in world units. */
  size: number;
  /** Stroke opacity from 0 to 1. */
  opacity: number;
};

/** Connector endpoint definition. */
export type CanvasConnectorEnd =
  | {
      /** Target element id for the endpoint. */
      elementId: string;
      /** Optional anchor id within the target element. */
      anchorId?: string;
    }
  | {
      /** Absolute point in world coordinates. */
      point: CanvasPoint;
    };

/** Anchor definition returned by node definitions. */
export type CanvasAnchorDefinition =
  | CanvasPoint
  | {
      /** Anchor identifier stable across renders. */
      id: string;
      /** Anchor position in world coordinates. */
      point: CanvasPoint;
    };

/** Normalized anchor data resolved for a node. */
export type CanvasAnchor = {
  /** Anchor identifier used by connectors. */
  id: string;
  /** Anchor position in world coordinates. */
  point: CanvasPoint;
};

/** Anchor hit information for tooling interactions. */
export type CanvasAnchorHit = {
  /** Element id that owns the anchor. */
  elementId: string;
  /** Anchor id within the element. */
  anchorId: string;
  /** Anchor position in world coordinates. */
  point: CanvasPoint;
};

/** Anchor map keyed by element id. */
export type CanvasAnchorMap = Record<string, CanvasAnchor[]>;

/** Connector endpoint role. */
export type CanvasConnectorEndpointRole = "source" | "target";

/** Connector endpoint hit for editing. */
export type CanvasConnectorEndpointHit = {
  /** Connector id being edited. */
  connectorId: string;
  /** Endpoint role for the connector. */
  role: CanvasConnectorEndpointRole;
  /** Endpoint position in world coordinates. */
  point: CanvasPoint;
};

/** Selection box rectangle in world coordinates. */
export type CanvasSelectionBox = CanvasRect;

/** Alignment guide line for snapping feedback. */
export type CanvasAlignmentGuide = {
  /** Axis of the guide line. */
  axis: "x" | "y";
  /** Fixed axis value in world coordinates. */
  value: number;
  /** Start coordinate along the other axis. */
  start: number;
  /** End coordinate along the other axis. */
  end: number;
};

/** Connector style variants for path rendering. */
export type CanvasConnectorStyle =
  | "straight"
  | "elbow"
  | "curve"
  | "hand"
  | "fly";

/** Connector element for linking nodes. */
export type CanvasConnectorElement = CanvasElementBase & {
  /** Discriminator for connector elements. */
  kind: "connector";
  /** Connector start information. */
  source: CanvasConnectorEnd;
  /** Connector end information. */
  target: CanvasConnectorEnd;
  /** Connector visual style key. */
  style?: CanvasConnectorStyle;
  /** Connector stroke color override. */
  color?: string;
  /** Whether the connector uses a dashed stroke. */
  dashed?: boolean;
};

/** Draft connector used for interactive linking. */
export type CanvasConnectorDraft = {
  /** Draft source endpoint. */
  source: CanvasConnectorEnd;
  /** Draft target endpoint. */
  target: CanvasConnectorEnd;
  /** Draft style for previews. */
  style?: CanvasConnectorStyle;
  /** Draft stroke color override. */
  color?: string;
  /** Whether the draft uses a dashed stroke. */
  dashed?: boolean;
};

/** Pending connector drop information for node creation. */
export type CanvasConnectorDrop = {
  /** Source endpoint of the connector. */
  source: CanvasConnectorEnd;
  /** World point where the drop occurred. */
  point: CanvasPoint;
};

/** Pending insert request for one-shot placement. */
export type CanvasInsertRequest = {
  /** Insert request identifier used by the toolbar. */
  id: string;
  /** Node type identifier to insert. */
  type: string;
  /** Props passed to the node definition. */
  props: Record<string, unknown>;
  /** Optional default size for the inserted node. */
  size?: [number, number];
};

/** Template entry shown when dragging a connector from a node anchor. */
export type CanvasConnectorTemplateDefinition = {
  /** Template identifier used by the picker. */
  id: string;
  /** Display label for the picker. */
  label: string;
  /** Description shown under the label. */
  description: string;
  /** Default size for the created node. */
  size: [number, number];
  /** Optional icon rendered in the picker. */
  icon?: ReactNode;
  /** Build the node payload inserted by the picker. */
  createNode: (input: { sourceElementId?: string }) => {
    /** Node type identifier to insert. */
    type: string;
    /** Node props passed to the engine. */
    props: Record<string, unknown>;
  };
};

/** Union of all supported element types. */
export type CanvasElement = CanvasNodeElement | CanvasConnectorElement;

/** Shared settings for stroke tools. */
export type CanvasStrokeSettings = {
  /** Stroke size in world units. */
  size: number;
  /** Stroke color in CSS format. */
  color: string;
  /** Stroke opacity from 0 to 1. */
  opacity: number;
};

/** Viewport state used by renderers. */
export type CanvasViewportState = {
  /** Zoom scale of the viewport. */
  zoom: number;
  /** Viewport translation in screen coordinates. */
  offset: CanvasPoint;
  /** Viewport size in screen pixels. */
  size: CanvasPoint;
};

/** View state used for DOM and overlay layers. */
export type CanvasViewState = {
  /** Current viewport state. */
  viewport: CanvasViewportState;
  /** Whether the viewport is being panned. */
  panning: boolean;
};

/** Snapshot of the canvas for React rendering. */
export type CanvasSnapshot = {
  /** Ordered elements for rendering. */
  elements: CanvasElement[];
  /** Current document revision for render caching. */
  docRevision: number;
  /** Selected element ids. */
  selectedIds: string[];
  /** Node id currently in edit mode. */
  editingNodeId: string | null;
  /** Current viewport state. */
  viewport: CanvasViewportState;
  /** Anchor map used for rendering connectors. */
  anchors: CanvasAnchorMap;
  /** Alignment guides for snapping feedback. */
  alignmentGuides: CanvasAlignmentGuide[];
  /** Selection box for rectangle selection. */
  selectionBox: CanvasSelectionBox | null;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Active tool id for UI state. */
  activeToolId: string | null;
  /** Currently dragging element id. */
  draggingId: string | null;
  /** Whether the viewport is being panned. */
  panning: boolean;
  /** Whether the canvas is locked. */
  locked: boolean;
  /** Draft connector for interactive linking. */
  connectorDraft: CanvasConnectorDraft | null;
  /** Hovered anchor while linking. */
  connectorHover: CanvasAnchorHit | null;
  /** Hovered node id used for showing anchor UI. */
  nodeHoverId: string | null;
  /** Hovered connector id for visual feedback. */
  connectorHoverId: string | null;
  /** Active connector style for tooling. */
  connectorStyle: CanvasConnectorStyle;
  /** Whether new connectors use dashed strokes. */
  connectorDashed: boolean;
  /** Pending connector drop used for node creation. */
  connectorDrop: CanvasConnectorDrop | null;
  /** Pending insert request for one-shot placement. */
  pendingInsert: CanvasInsertRequest | null;
  /** Pending insert cursor point in world space. */
  pendingInsertPoint: CanvasPoint | null;
  /** Whether a toolbar drag-insert gesture is active. */
  toolbarDragging: boolean;
};

/** Props delivered to a node renderer component. */
export type CanvasNodeViewProps<P> = {
  /** Node element data. */
  element: CanvasNodeElement<P>;
  /** Current selection state for the node. */
  selected: boolean;
  /** Whether the node is in edit mode. */
  editing?: boolean;
  /** Request selecting this node. */
  onSelect: () => void;
  /** Request updating node props. */
  onUpdate: (patch: Partial<P>) => void;
};

/** Node capability flags used by tool and UI layers. */
export type CanvasNodeCapabilities = {
  /** Allow resize handles on this node. */
  resizable?: boolean;
  /** Resize behavior for single-node handles (ratio-range uses minSize/maxSize ratios). */
  resizeMode?: "free" | "uniform" | "ratio-range";
  /** Allow rotation handles on this node. */
  rotatable?: boolean;
  /** Allow connecting to this node. */
  connectable?: "auto" | "anchors" | "none";
  /** Minimum size for resize constraints. */
  minSize?: { w: number; h: number };
  /** Maximum size for resize constraints. */
  maxSize?: { w: number; h: number };
};

/** Toolbar action descriptor for node-level UI. */
export type CanvasToolbarItem = {
  /** Toolbar action id. */
  id: string;
  /** Toolbar action label. */
  label: string;
  /** Whether to show the label below the icon. */
  showLabel?: boolean;
  /** Whether the item is active. */
  active?: boolean;
  /** Toolbar action icon. */
  icon: ReactNode;
  /** Toolbar action handler. */
  onSelect?: () => void;
  /** Optional panel content for secondary toolbar controls. */
  panel?: ReactNode | ((ctx: { closePanel: () => void }) => ReactNode);
  /** Optional className for the panel container. */
  panelClassName?: string;
};

/** Toolbar context passed to node definitions. */
export type CanvasToolbarContext<P> = {
  /** Target node element. */
  element: CanvasNodeElement<P>;
  /** Current selection state. */
  selected: boolean;
  /** File scope metadata for board nodes. */
  fileContext?: BoardFileContext;
  /** Open the node inspector panel. */
  openInspector: (elementId: string) => void;
  /** Update node props and commit to history. */
  updateNodeProps: (patch: Partial<P>) => void;
  /** Ungroup the current selection. */
  ungroupSelection: () => void;
  /** Normalize child node sizes inside a group. */
  uniformGroupSize: (groupId: string) => void;
  /** Auto layout child nodes inside a group. */
  layoutGroup: (groupId: string, direction?: "row" | "column") => void;
  /** Resolve the current layout axis for a group. */
  getGroupLayoutAxis: (groupId: string) => "row" | "column" | "mixed";
};

/** Node definition used for registration. */
export type CanvasNodeDefinition<P> = {
  /** Node type identifier. */
  type: string;
  /** Zod schema for validating node props. */
  schema?: ZodType<P>;
  /** Default props used for new nodes. */
  defaultProps: P;
  /** React component used to render the node. */
  view: ComponentType<CanvasNodeViewProps<P>>;
  /** Measure function used to auto-resize nodes. */
  measure?: (props: P, ctx: { viewport: CanvasViewportState }) => {
    /** Measured width in world coordinates. */
    w: number;
    /** Measured height in world coordinates. */
    h: number;
  };
  /** Anchor resolver for connectors. */
  anchors?: (props: P, bounds: CanvasRect) => CanvasAnchorDefinition[];
  /** Connector templates shown when dragging from this node's anchors. */
  connectorTemplates?: (element: CanvasNodeElement<P>) => CanvasConnectorTemplateDefinition[];
  /** Toolbar definition for the node. */
  toolbar?: (ctx: CanvasToolbarContext<P>) => CanvasToolbarItem[];
  /** Capability flags for tools and UI. */
  capabilities?: CanvasNodeCapabilities;
};
