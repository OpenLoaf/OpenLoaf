/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { XIcon } from 'lucide-react'
import i18next from 'i18next'
import type { VideoTrimPayload } from './video-trim-types'
import { VideoTrimPlayer } from './VideoTrimPlayer'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type VideoTrimDialogStore = {
  payload: VideoTrimPayload | null
  open: (payload: VideoTrimPayload) => void
  close: () => void
}

export const useVideoTrimDialogStore = create<VideoTrimDialogStore>((set) => ({
  payload: null,
  open: (payload) => set({ payload }),
  close: () => set({ payload: null }),
}))

/** Open the video trim dialog from anywhere. */
export function openVideoTrimDialog(payload: VideoTrimPayload) {
  useVideoTrimDialogStore.getState().open(payload)
}

// Re-export for consumers
export type { VideoTrimPayload }

// ---------------------------------------------------------------------------
// Dialog content
// ---------------------------------------------------------------------------

function VideoTrimDialogContent({ payload }: { payload: VideoTrimPayload }) {
  const close = useVideoTrimDialogStore((s) => s.close)

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [close])

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      onWheel={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/20 animate-in fade-in-0 duration-200"
        onClick={close}
      />
      {/* Content */}
      <div className="bg-card absolute top-[50%] left-[50%] z-50 flex max-h-[85vh] w-full max-w-3xl translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ol-divider px-5 py-3">
          <h2 className="text-sm font-semibold leading-none">
            {i18next.t('board:videoNode.trim.dialogTitle', { defaultValue: 'Trim Video' })}
          </h2>
          <button
            type="button"
            className="rounded-md opacity-70 transition-opacity hover:opacity-100"
            onClick={close}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {/* Player + Timeline + Controls */}
        <VideoTrimPlayer
          payload={payload}
          onConfirm={payload.onConfirm}
          onClose={close}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export: always-mounted shell driven by Zustand
// ---------------------------------------------------------------------------

export function VideoTrimDialog() {
  const payload = useVideoTrimDialogStore((s) => s.payload)
  if (!payload) return null
  return <VideoTrimDialogContent payload={payload} />
}
