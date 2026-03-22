/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type AnchorDirection = 'input' | 'output'

/** Map anchor ID to its semantic direction. Left = input, Right = output. */
export function getAnchorDirection(anchorId: string): AnchorDirection {
  return anchorId === 'left' ? 'input' : 'output'
}

/** Check if a connection direction is valid (output → input only). */
export function isValidConnectionDirection(
  sourceAnchorId: string,
  targetAnchorId: string,
): boolean {
  return getAnchorDirection(sourceAnchorId) === 'output'
    && getAnchorDirection(targetAnchorId) === 'input'
}
