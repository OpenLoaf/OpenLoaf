/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { TEXT_NODE_DEFAULT_HEIGHT } from "../nodes/text-node-constants";
import { PlacementTool } from "./PlacementTool";

/** Quick-create tool for text (sticky note) nodes. */
export class TextPlacementTool extends PlacementTool {
  readonly id = "text";

  getNodeType(): string {
    return "text";
  }

  getDefaultProps(): Record<string, unknown> {
    return {
      autoFocus: true,
      style: "sticky",
      stickyColor: "yellow",
    };
  }

  getDefaultSize(): [number, number] {
    return [200, TEXT_NODE_DEFAULT_HEIGHT];
  }
}
