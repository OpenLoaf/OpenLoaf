/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { PlacementTool } from "./PlacementTool";

/** Quick-create tool for shape-styled text nodes. */
export class ShapePlacementTool extends PlacementTool {
  readonly id = "shape";

  getNodeType(): string {
    return "text";
  }

  getDefaultProps(): Record<string, unknown> {
    return {
      autoFocus: true,
      style: "shape",
      shapeType: "rectangle",
      shapeFill: "#3b82f6",
      shapeStroke: "#2563eb",
      shapeStrokeWidth: 2,
    };
  }

  getDefaultSize(): [number, number] {
    return [160, 120];
  }
}
