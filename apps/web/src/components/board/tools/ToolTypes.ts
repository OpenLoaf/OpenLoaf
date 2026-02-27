/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasPoint } from "../engine/types";
import type { CanvasEngine } from "../engine/CanvasEngine";

/** Tool context passed to tool handlers. */
export type ToolContext = {
  /** Engine instance for querying and updates. */
  engine: CanvasEngine;
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
  onKeyDown?: (event: KeyboardEvent, engine: CanvasEngine) => void;
};
