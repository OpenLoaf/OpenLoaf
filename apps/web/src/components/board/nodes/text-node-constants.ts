/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Leaf-level constants for text nodes. This file must NOT import from
 * engine, tools, or any React component to avoid circular dependencies.
 */

/** Vertical padding (top + bottom) inside a text node. */
export const TEXT_NODE_VERTICAL_PADDING = 20

/** Default font size for text nodes. */
export const TEXT_NODE_DEFAULT_FONT_SIZE = 18

/** Line-height multiplier for text nodes. */
export const TEXT_NODE_LINE_HEIGHT = 1.4

/** Default height for a single-line text node. */
export const TEXT_NODE_DEFAULT_HEIGHT = Math.ceil(
  TEXT_NODE_DEFAULT_FONT_SIZE * TEXT_NODE_LINE_HEIGHT + TEXT_NODE_VERTICAL_PADDING,
)
