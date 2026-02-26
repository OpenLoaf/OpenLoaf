/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/** Track whether a board has content, keyed by boardFolderUri. */
const boardElementCounts = new Map<string, number>();

/** Update the element count for a board. */
export function setBoardElementCount(boardFolderUri: string, count: number) {
  boardElementCounts.set(boardFolderUri, count);
}

/** Check whether a board has any elements. */
export function isBoardEmpty(boardFolderUri: string): boolean {
  return (boardElementCounts.get(boardFolderUri) ?? 0) === 0;
}

/** Remove tracking entry when the board unmounts. */
export function clearBoardTracking(boardFolderUri: string) {
  boardElementCounts.delete(boardFolderUri);
}
