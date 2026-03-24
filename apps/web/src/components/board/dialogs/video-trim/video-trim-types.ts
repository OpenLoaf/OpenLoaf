/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

export type VideoTrimPayload = {
  videoPath: string
  ids: { projectId?: string; boardId?: string }
  duration: number
  clipStart: number
  clipEnd: number
  posterSrc?: string
  onConfirm: (clipStart: number, clipEnd: number, posterDataUrl?: string) => void
}

export type DragTarget = 'start' | 'end' | 'playhead' | null
