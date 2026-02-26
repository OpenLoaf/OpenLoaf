/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasPoint } from "../engine/types";
import type { CanvasTool, ToolContext } from "./ToolTypes";

export class HandTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "hand";
  /** Panning start point in screen coordinates. */
  private panStart: CanvasPoint | null = null;
  /** Panning start offset. */
  private panOffset: CanvasPoint | null = null;

  /** Begin viewport panning. */
  onPointerDown(ctx: ToolContext): void {
    ctx.event.preventDefault();
    const { offset } = ctx.engine.viewport.getState();
    this.panStart = ctx.screenPoint;
    this.panOffset = offset;
    ctx.engine.setPanning(true);
  }

  /** Update viewport panning position. */
  onPointerMove(ctx: ToolContext): void {
    if (!this.panStart || !this.panOffset) return;

    const dx = ctx.screenPoint[0] - this.panStart[0];
    const dy = ctx.screenPoint[1] - this.panStart[1];
    ctx.engine.setViewportOffset([this.panOffset[0] + dx, this.panOffset[1] + dy]);
  }

  /** Stop viewport panning. */
  onPointerUp(ctx: ToolContext): void {
    ctx.engine.setPanning(false);
    this.panStart = null;
    this.panOffset = null;
  }
}
