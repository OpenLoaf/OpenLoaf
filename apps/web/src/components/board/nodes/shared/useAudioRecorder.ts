/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardFileContext } from '../../board-contracts'
import { saveBoardAssetFile } from '../../utils/board-asset'

export type AudioRecorderState = 'idle' | 'recording' | 'saving'

export type UseAudioRecorderOptions = {
  fileContext: BoardFileContext | undefined
  onSaved: (relativePath: string, fileName: string, duration: number) => void
}

export type UseAudioRecorderReturn = {
  state: AudioRecorderState
  /** Elapsed recording time in seconds. */
  elapsed: number
  startRecording: () => Promise<void>
  stopRecording: () => void
}

/**
 * Hook that records audio from the user's microphone via MediaRecorder
 * and saves the result as a board asset file.
 */
export function useAudioRecorder({
  fileContext,
  onSaved,
}: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [state, setState] = useState<AudioRecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  // Cleanup on unmount.
  useEffect(() => cleanup, [cleanup])

  const startRecording = useCallback(async () => {
    if (state !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const duration = (Date.now() - startTimeRef.current) / 1000
        const blob = new Blob(chunksRef.current, { type: mimeType })
        cleanup()

        if (!fileContext?.boardId && !fileContext?.boardFolderUri) {
          setState('idle')
          return
        }

        setState('saving')
        try {
          const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
          const fileName = `recording_${Date.now()}.${ext}`
          const file = new File([blob], fileName, { type: mimeType })
          const relativePath = await saveBoardAssetFile({
            file,
            fallbackName: `recording.${ext}`,
            projectId: fileContext.projectId,
            boardId: fileContext.boardId,
            boardFolderUri: fileContext.boardFolderUri,
          })
          onSaved(relativePath, fileName, duration)
        } catch {
          // ignore save failure
        }
        setState('idle')
        setElapsed(0)
      }

      startTimeRef.current = Date.now()
      setElapsed(0)
      setState('recording')
      recorder.start(250) // collect data every 250ms

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 500)
    } catch {
      cleanup()
      setState('idle')
    }
  }, [state, fileContext, onSaved, cleanup])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
  }, [])

  return { state, elapsed, startRecording, stopRecording }
}
