/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { VariantFormProps, VariantParamsSnapshot, VariantUpstream } from '../types'
import type { V3Variant } from '@/lib/saas-media'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? k,
    i18n: { language: 'en-US' },
  }),
}))

// Mock MediaSlot (renders nothing) + toMediaInput + useMediaSlots + UpstreamTextBadge
vi.mock('../shared', () => {
  const { useState, useMemo, useCallback } = require('react') // eslint-disable-line
  return {
    MediaSlot: () => null,
    UpstreamTextBadge: () => null,
    PillSelect: ({
      options,
      value,
      onChange,
    }: {
      options: { value: string; label: string }[]
      value: string
      onChange: (v: string) => void
    }) => (
      <select
        data-testid="pill-select"
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
      >
        {options.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ),
    toMediaInput: (src: string) => {
      if (/^(data:|https?:|blob:)/i.test(src)) return { url: src }
      return { path: src }
    },
    useSourceImage: (
      nodeResourceUrl?: string,
      nodeResourcePath?: string,
      upstream?: any,
    ) => ({
      sourceUrl: nodeResourceUrl ?? upstream?.images?.[0],
      sourcePath: nodeResourcePath ?? upstream?.imagePaths?.[0],
      rawSourceUrl: nodeResourceUrl ?? upstream?.images?.[0],
      imgLoadFailed: false,
      setImgLoadFailed: () => {},
    }),
    useMediaSlots: (max: number, nodeResourcePath?: string, upstream?: any) => {
      const nodeImage = nodeResourcePath?.trim() || ''
      const upPaths = upstream?.imagePaths ?? upstream?.images ?? []
      const apiImages = useMemo(
        () => [...(nodeImage ? [nodeImage] : []), ...upPaths].slice(0, max),
        [nodeImage, max],
      )
      return {
        manualImages: [] as string[],
        displayImages: upstream?.images ?? [],
        apiImages,
        addImage: () => {},
        removeImage: () => {},
        trimToMax: useCallback(() => {}, []),
        canAdd: false,
      }
    },
  }
})

// Mock board-style-system
vi.mock('../../../ui/board-style-system', () => ({
  BOARD_GENERATE_INPUT: 'mock-input-class',
}))

// Mock node-config constants used by VidGenVolcVariant and ImgGenVolcVariant
vi.mock('../../../nodes/node-config', () => ({
  VIDEO_GENERATE_ASPECT_RATIO_OPTIONS: ['auto', '16:9', '9:16'],
  VIDEO_GENERATE_DURATION_OPTIONS: [5, 10, 15],
  VIDEO_GENERATE_STYLE_SUGGESTIONS: ['cinematic', 'anime'],
  IMAGE_GENERATE_ASPECT_RATIO_OPTIONS: ['auto', '1:1', '16:9'],
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVariant(id: string): V3Variant {
  return {
    id,
    featureTabName: 'default',
    creditsPerCall: 10,
    minMembershipLevel: 'free',
  }
}

const mockUpstream: VariantUpstream = {
  textContent: 'test prompt',
  images: ['https://example.com/img.jpg'],
  imagePaths: ['asset/img.jpg'],
  audioUrl: 'https://example.com/audio.mp3',
  videoUrl: 'https://example.com/video.mp4',
  boardId: 'test-board',
  projectId: 'test-project',
}

/** Render a variant and capture the last onParamsChange call. */
async function renderAndCapture(
  Component: React.ComponentType<VariantFormProps>,
  props: Partial<VariantFormProps> & {
    variant: V3Variant
    upstream: VariantUpstream
  },
): Promise<VariantParamsSnapshot> {
  const onParamsChange = vi.fn<(snap: VariantParamsSnapshot) => void>()
  const onWarningChange = vi.fn()

  render(
    <Component
      variant={props.variant}
      upstream={props.upstream}
      nodeResourceUrl={props.nodeResourceUrl}
      nodeResourcePath={props.nodeResourcePath}
      disabled={false}
      initialParams={props.initialParams}
      onParamsChange={onParamsChange}
      onWarningChange={onWarningChange}
    />,
  )

  await waitFor(() => {
    expect(onParamsChange).toHaveBeenCalled()
  })

  const lastCall = onParamsChange.mock.calls.at(-1)?.[0]
  if (!lastCall) throw new Error('onParamsChange was never called')
  return lastCall
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => cleanup())

describe('VidGenVolcVariant (OL-VG-003) — prompt in params', () => {
  it('places prompt in params, not in inputs', async () => {
    const { VidGenVolcVariant } = await import('../video/VidGenVolcVariant')
    const snap = await renderAndCapture(VidGenVolcVariant, {
      variant: makeVariant('OL-VG-003'),
      upstream: { ...mockUpstream },
    })

    expect(snap.params).toHaveProperty('prompt')
    expect(snap.inputs).not.toHaveProperty('prompt')
  })
})

describe('LipSyncVolcVariant (OL-LS-001) — input key is video', () => {
  it('uses "video" key (not "person") in inputs', async () => {
    const { LipSyncVolcVariant } = await import('../video/LipSyncVolcVariant')
    const snap = await renderAndCapture(LipSyncVolcVariant, {
      variant: makeVariant('OL-LS-001'),
      upstream: {
        ...mockUpstream,
        videoUrl: 'https://example.com/video.mp4',
        audioUrl: 'https://example.com/audio.mp3',
      },
    })

    expect(snap.inputs).toHaveProperty('video')
    expect(snap.inputs).not.toHaveProperty('person')
  })
})

describe('FaceSwapQwenVariant (OL-FS-001) — mode param', () => {
  it('includes mode in params with a valid value', async () => {
    const { FaceSwapQwenVariant } = await import(
      '../video/FaceSwapQwenVariant'
    )
    const snap = await renderAndCapture(FaceSwapQwenVariant, {
      variant: makeVariant('OL-FS-001'),
      upstream: {
        ...mockUpstream,
        videoUrl: 'https://example.com/video.mp4',
        images: ['https://example.com/face.jpg'],
        imagePaths: ['asset/face.jpg'],
      },
    })

    expect(snap.params).toHaveProperty('mode')
    expect(['wan-std', 'wan-pro']).toContain(snap.params.mode)
  })
})

describe('ImgEditWanVariant (OL-IE-001) — enable_interleave', () => {
  it('includes enable_interleave in params', async () => {
    const { ImgEditWanVariant } = await import('../image/ImgEditWanVariant')
    const snap = await renderAndCapture(ImgEditWanVariant, {
      variant: makeVariant('OL-IE-001'),
      upstream: {
        ...mockUpstream,
        images: ['https://example.com/ref.jpg'],
        imagePaths: ['asset/ref.jpg'],
      },
    })

    expect(snap.params).toHaveProperty('enable_interleave')
  })
})

describe('ImgGenVolcVariant (OL-IG-005) — prompt in params', () => {
  it('places prompt in params, not in inputs', async () => {
    const { ImgGenVolcVariant } = await import('../image/ImgGenVolcVariant')
    const snap = await renderAndCapture(ImgGenVolcVariant, {
      variant: makeVariant('OL-IG-005'),
      upstream: { ...mockUpstream },
    })

    expect(snap.params).toHaveProperty('prompt')
    expect(snap.inputs).not.toHaveProperty('prompt')
  })
})
