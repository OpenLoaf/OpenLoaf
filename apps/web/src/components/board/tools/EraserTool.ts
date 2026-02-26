/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { CanvasTool, ToolContext } from "./ToolTypes";
import { ERASER_RADIUS } from "../engine/constants";

export class EraserTool implements CanvasTool {
  /** Tool identifier. */
  readonly id = "eraser";
  /** Whether erasing is active. */
  private erasing = false;
  /** Collected ids erased during the current gesture. */
  private readonly erasedIds = new Set<string>();

  /** Begin erasing stroke nodes. */
  onPointerDown(ctx: ToolContext): void {
    if (ctx.event.button !== 0) return;
    if (ctx.engine.isLocked()) return;
    ctx.event.preventDefault();
    this.erasing = true;
    this.erasedIds.clear();
    this.eraseAt(ctx);
  }

  /** Continue erasing stroke nodes while moving. */
  onPointerMove(ctx: ToolContext): void {
    if (!this.erasing) return;
    this.eraseAt(ctx);
  }

  /** Finish the erase gesture. */
  onPointerUp(ctx: ToolContext): void {
    if (!this.erasing) return;
    this.erasing = false;
    if (this.erasedIds.size > 0) {
      ctx.engine.commitHistory();
    }
  }

  /** Remove stroke nodes near the pointer. */
  private eraseAt(ctx: ToolContext): void {
    const removed = ctx.engine.eraseStrokesAt(ctx.worldPoint, ERASER_RADIUS);
    removed.forEach(id => this.erasedIds.add(id));
  }
}
