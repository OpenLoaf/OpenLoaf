/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import nodePath from 'node:path'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import type { UIMessage } from 'ai'
import type { ModelDefinition } from '@openloaf/api/common'

// ---------------------------------------------------------------------------
// Module-level mocks (must be hoisted via vi.mock before importing the SUT)
// ---------------------------------------------------------------------------

vi.mock('@/ai/shared/saasUploader', () => ({
  uploadFileToSaasCdn: vi.fn(),
}))

vi.mock('@/ai/tools/toolScope', () => ({
  expandPathTemplateVars: (input: string) => input,
}))

vi.mock('@/ai/services/image/attachmentResolver', () => ({
  resolveProjectFilePath: vi.fn(async () => null),
  loadProjectImageBuffer: vi.fn(async () => ({
    buffer: Buffer.from('fake-jpeg-bytes'),
    mediaType: 'image/jpeg',
  })),
}))

import { uploadFileToSaasCdn } from '@/ai/shared/saasUploader'
import { expandAttachmentTagsForModel } from '@/ai/shared/attachmentTagExpander'

const mockedUpload = vi.mocked(uploadFileToSaasCdn)

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string
let imagePath: string
let videoPath: string
let oversizedVideoPath: string
let audioPath: string

async function setupFiles() {
  tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'expander-'))
  imagePath = nodePath.join(tmpDir, 'pic.jpg')
  videoPath = nodePath.join(tmpDir, 'clip.mp4')
  oversizedVideoPath = nodePath.join(tmpDir, 'huge.mp4')
  audioPath = nodePath.join(tmpDir, 'song.mp3')
  await fs.writeFile(imagePath, Buffer.from('fake-jpeg'))
  await fs.writeFile(videoPath, Buffer.from('fake-mp4'))
  // 21MB — above 20MB video limit
  await fs.writeFile(oversizedVideoPath, Buffer.alloc(21 * 1024 * 1024))
  await fs.writeFile(audioPath, Buffer.from('fake-mp3'))
}

async function cleanupFiles() {
  await fs.rm(tmpDir, { recursive: true, force: true })
}

function makeMessage(text: string, id = 'm1'): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage
}

function visionModel(tags: string[]): ModelDefinition {
  return {
    id: 'm',
    tags: tags as any,
  }
}

function makeTag(path: string, url?: string, uploadedAt?: string): string {
  const attrs = [`path="${path}"`]
  if (url) attrs.push(`url="${url}"`)
  if (uploadedAt) attrs.push(`uploadedAt="${uploadedAt}"`)
  return `<system-tag type="attachment" ${attrs.join(' ')} />`
}

beforeEach(async () => {
  vi.clearAllMocks()
  await setupFiles()
})

afterEach(async () => {
  await cleanupFiles()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expandAttachmentTagsForModel', () => {
  describe('short-circuit paths', () => {
    it('returns input unchanged when model has no media caps', async () => {
      const msg = makeMessage(`A ${makeTag(imagePath)} B`)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['chat']))
      expect(out.messages).toEqual([msg])
      expect(out.mutations).toHaveLength(0)
      expect(mockedUpload).not.toHaveBeenCalled()
    })

    it('returns input unchanged when modelDefinition is undefined', async () => {
      const msg = makeMessage(`A ${makeTag(imagePath)} B`)
      const out = await expandAttachmentTagsForModel([msg], undefined)
      expect(out.messages).toEqual([msg])
    })

    it('skips assistant messages', async () => {
      const msg: UIMessage = {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: makeTag(imagePath) }],
      } as UIMessage
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))
      expect(out.messages).toEqual([msg])
      expect(mockedUpload).not.toHaveBeenCalled()
    })
  })

  describe('CDN upload path', () => {
    it('uploads and emits file part with https url + mutation', async () => {
      mockedUpload.mockResolvedValueOnce({ url: 'https://cdn/x.jpg', mediaType: 'image/jpeg' })
      const msg = makeMessage(`Prefix ${makeTag(imagePath)} suffix`)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      const parts = (out.messages[0] as any).parts
      expect(parts).toHaveLength(3)
      expect(parts[0]).toEqual({ type: 'text', text: expect.stringContaining('Prefix ') })
      expect(parts[1]).toEqual({
        type: 'file',
        url: 'https://cdn/x.jpg',
        mediaType: 'image/jpeg',
      })
      expect(parts[2]).toEqual({ type: 'text', text: ' suffix' })
      // text part now contains the rewritten tag with url + uploadedAt
      expect(parts[0].text).toContain('url="https://cdn/x.jpg"')
      expect(parts[0].text).toContain('uploadedAt="')
      expect(out.mutations).toHaveLength(1)
      expect(out.mutations[0]!.messageId).toBe('m1')
    })

    it('reuses fresh CDN url without uploading', async () => {
      const fresh = new Date().toISOString()
      const tag = makeTag(imagePath, 'https://cdn/cached.jpg', fresh)
      const msg = makeMessage(`X ${tag} Y`)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      expect(mockedUpload).not.toHaveBeenCalled()
      expect(out.mutations).toHaveLength(0)
      const parts = (out.messages[0] as any).parts
      expect(parts.find((p: any) => p.type === 'file')?.url).toBe('https://cdn/cached.jpg')
    })

    it('re-uploads when cached url is stale', async () => {
      const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      mockedUpload.mockResolvedValueOnce({ url: 'https://cdn/fresh.jpg', mediaType: 'image/jpeg' })
      const tag = makeTag(imagePath, 'https://cdn/stale.jpg', stale)
      const msg = makeMessage(tag)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      expect(mockedUpload).toHaveBeenCalledTimes(1)
      const fileParts = (out.messages[0] as any).parts.filter((p: any) => p.type === 'file')
      expect(fileParts[0].url).toBe('https://cdn/fresh.jpg')
      expect(out.mutations).toHaveLength(1)
    })
  })

  describe('base64 fallback', () => {
    it('falls back to base64 data URI when upload returns null', async () => {
      mockedUpload.mockResolvedValueOnce(null)
      const msg = makeMessage(makeTag(imagePath))
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      const fileParts = (out.messages[0] as any).parts.filter((p: any) => p.type === 'file')
      expect(fileParts).toHaveLength(1)
      expect(fileParts[0].url).toMatch(/^data:image\/jpeg;base64,/)
      // base64 path does NOT persist
      expect(out.mutations).toHaveLength(0)
    })

    it('video file uses raw base64 (not sharp)', async () => {
      mockedUpload.mockResolvedValueOnce(null)
      const msg = makeMessage(makeTag(videoPath))
      const out = await expandAttachmentTagsForModel([msg], visionModel(['video_analysis']))

      const fileParts = (out.messages[0] as any).parts.filter((p: any) => p.type === 'file')
      expect(fileParts).toHaveLength(1)
      expect(fileParts[0].mediaType).toBe('video/mp4')
      expect(fileParts[0].url).toMatch(/^data:video\/mp4;base64,/)
      expect(out.mutations).toHaveLength(0)
    })
  })

  describe('size limits', () => {
    it('keeps tag as text for oversized video (>20MB)', async () => {
      const tag = makeTag(oversizedVideoPath)
      const msg = makeMessage(`prefix ${tag} suffix`)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['video_analysis']))

      expect(mockedUpload).not.toHaveBeenCalled()
      const parts = (out.messages[0] as any).parts
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('text')
      expect(parts[0].text).toContain(tag)
    })
  })

  describe('unsupported kinds', () => {
    it('keeps tag as text when model supports image but tag is video', async () => {
      const tag = makeTag(videoPath)
      const msg = makeMessage(tag)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      expect(mockedUpload).not.toHaveBeenCalled()
      const parts = (out.messages[0] as any).parts
      expect(parts).toHaveLength(1)
      expect(parts[0].text).toContain(tag)
    })

    it('keeps tag for unknown extensions', async () => {
      const unknownPath = nodePath.join(tmpDir, 'weird.xyz')
      await fs.writeFile(unknownPath, 'data')
      const tag = makeTag(unknownPath)
      const msg = makeMessage(tag)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      expect(mockedUpload).not.toHaveBeenCalled()
      const parts = (out.messages[0] as any).parts
      expect(parts[0].text).toContain(tag)
    })
  })

  describe('mixed messages', () => {
    it('splits text around multiple tags in order', async () => {
      mockedUpload
        .mockResolvedValueOnce({ url: 'https://cdn/a.jpg', mediaType: 'image/jpeg' })
        .mockResolvedValueOnce({ url: 'https://cdn/b.jpg', mediaType: 'image/jpeg' })
      const img2 = nodePath.join(tmpDir, 'pic2.jpg')
      await fs.writeFile(img2, 'fake')
      const msg = makeMessage(`A ${makeTag(imagePath)} B ${makeTag(img2)} C`)
      const out = await expandAttachmentTagsForModel([msg], visionModel(['image_input']))

      const parts = (out.messages[0] as any).parts
      expect(parts.length).toBeGreaterThanOrEqual(5)
      const fileParts = parts.filter((p: any) => p.type === 'file')
      expect(fileParts.map((p: any) => p.url)).toEqual([
        'https://cdn/a.jpg',
        'https://cdn/b.jpg',
      ])
      // 最后一段文本包含 " C"
      expect(parts[parts.length - 1].text).toContain(' C')
    })
  })
})
