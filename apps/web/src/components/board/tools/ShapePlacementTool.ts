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

/** Quick-create tool for shape nodes. */
export class ShapePlacementTool extends PlacementTool {
  readonly id = "shape";

  getNodeType(): string {
    return "shape";
  }

  getDefaultProps(): Record<string, unknown> {
    return {
      shape: "rectangle",
      fill: "#3b82f6",
      stroke: "#2563eb",
      strokeWidth: 2,
      text: "",
    };
  }

  getDefaultSize(): [number, number] {
    return [160, 120];
  }
}
