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

/** Quick-create tool for plain text nodes. */
export class TextPlacementTool extends PlacementTool {
  readonly id = "text";

  getNodeType(): string {
    return "text";
  }

  getDefaultProps(): Record<string, unknown> {
    return { autoFocus: true };
  }

  getDefaultSize(): [number, number] {
    return [280, 56];
  }
}
