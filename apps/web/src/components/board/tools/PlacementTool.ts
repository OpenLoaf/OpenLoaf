/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasTool, CanvasToolHost, ToolContext } from "./ToolTypes";

/**
 * Abstract base class for "click to place a node" tools.
 *
 * Subclasses define the node type, default props, and default size.
 * The tool sets a pending insert request on activation; when the user
 * clicks an empty area, ToolManager places the node and switches back
 * to the select tool.
 */
export abstract class PlacementTool implements CanvasTool {
  abstract readonly id: string;

  /** Node type to create. */
  abstract getNodeType(): string;

  /** Default props for the new node. */
  abstract getDefaultProps(): Record<string, unknown>;

  /** Default size [width, height] in canvas units. */
  abstract getDefaultSize(): [number, number];

  /** Called when this tool becomes active. Sets pending insert. */
  activate(engine: CanvasToolHost): void {
    const size = this.getDefaultSize();
    engine.setPendingInsert({
      id: this.id,
      type: this.getNodeType(),
      props: this.getDefaultProps(),
      size,
    });
  }

  /**
   * Pointer down is handled by ToolManager's pendingInsert logic.
   * Subclasses can override for custom behavior.
   */
  onPointerDown(_ctx: ToolContext): void {
    // Handled by ToolManager pendingInsert path
  }
}
