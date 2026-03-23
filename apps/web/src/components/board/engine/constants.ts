/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export const DEFAULT_NODE_SIZE: [number, number] = [320, 180];

export const SNAP_PIXEL = 8;
export const GUIDE_MARGIN = 16;
/** Canvas-unit radius for nearby-node snap queries (avoids global scan). */
export const SNAP_NEARBY_RANGE = 2000;
export const DRAG_ACTIVATION_DISTANCE = 2;
export const SELECTION_BOX_THRESHOLD = 4;

export const ANCHOR_HIT_RADIUS = 12;
export const EDGE_ANCHOR_HIT_RADIUS = 6;
export const EDGE_ANCHOR_CENTER_RANGE = 28;
export const CONNECTOR_ENDPOINT_HIT_RADIUS = 6;
export const CONNECTOR_HIT_RADIUS = 8;
export const STROKE_HIT_RADIUS = 8;

/** Base diameter for selected edge anchors in screen pixels. */
export const SELECTED_ANCHOR_EDGE_SIZE = 18;
/** Hover diameter for selected edge anchors in screen pixels. */
export const SELECTED_ANCHOR_EDGE_SIZE_HOVER = 24;
/** Base diameter for selected side anchors in screen pixels. */
export const SELECTED_ANCHOR_SIDE_SIZE = 24;
/** Hover diameter for selected side anchors in screen pixels. */
export const SELECTED_ANCHOR_SIDE_SIZE_HOVER = 28;
/** Extra gap from node edge to selected anchors in screen pixels. */
export const SELECTED_ANCHOR_GAP = 8;
/** Group outline padding in canvas units. */
export const GROUP_OUTLINE_PADDING = 20;

export const MIN_ZOOM = 0.1;
export const MIN_ZOOM_EPS = 0.0001;

export const HISTORY_MAX_SIZE = 100;
export const PASTE_OFFSET_STEP = 24;
export const LAYOUT_GAP = 80;
export const GROUP_LAYOUT_GAP = 24;
export const DEFAULT_FIT_PADDING = 120;
export const ERASER_RADIUS = 12;
export const MINDMAP_NODE_VERTICAL_SPACING = 45;
export const MINDMAP_NODE_HORIZONTAL_SPACING = 110;
export const MINDMAP_FIRST_LEVEL_HORIZONTAL_SPACING = 200;
export const MINDMAP_BRANCH_COLORS = [
  "#737373",
  "#1d4ed8",
  "#f59e0b",
  "#ef4444",
  "#16a34a",
];

export const MINIMAP_WIDTH = 180;
export const MINIMAP_HEIGHT = 120;
export const MINIMAP_PADDING_MIN = 80;
export const MINIMAP_PADDING_RATIO = 0.15;
export const MINIMAP_HIDE_DELAY = 900;

export const PAN_SOFT_PADDING_RATIO = 0.9;
export const PAN_SOFT_PADDING_MIN = 800;
export const PAN_SOFT_RESISTANCE_RATIO = 0.6;

export const MULTI_SELECTION_OUTLINE_PADDING = 12;
export const MULTI_SELECTION_HANDLE_SIZE = 22;

// ── Anchor magnetic animation ──
/** Screen-px: rest offset pushing anchor icon outward when visible but idle. */
export const ANCHOR_REST_OFFSET = 20;
/** Screen-px: max displacement during magnetic follow. */
export const ANCHOR_MAGNETIC_MAX = 10;
/** Dampening ratio: icon moves this fraction of the cursor offset (0–1). */
export const ANCHOR_MAGNETIC_DAMPEN = 0.4;
/** Ms: transition duration while cursor drags the icon. */
export const ANCHOR_MAGNETIC_DURATION_MS = 80;
/** Ms: bounce-back transition when cursor leaves hotzone. */
export const ANCHOR_BOUNCE_DURATION_MS = 400;
/** CSS easing for the bounce-back (slight overshoot). */
export const ANCHOR_BOUNCE_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
/** Ms: appear / disappear fade for the anchor icon. */
export const ANCHOR_APPEAR_DURATION_MS = 200;
/** Scale factor applied to anchor icon while magnetically followed. */
export const ANCHOR_MAGNETIC_SCALE = 1.08;
/** Screen-px: hotzone radius — cursor closer than this triggers magnetic follow. */
export const ANCHOR_HOTZONE_RADIUS = 60;
