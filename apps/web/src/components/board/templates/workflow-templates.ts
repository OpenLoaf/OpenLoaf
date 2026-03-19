/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { DEFAULT_NODE_SIZE } from '../engine/constants'

/** Definition of a reusable workflow template. */
export type WorkflowTemplate = {
  id: string
  /** i18n key for title (under `board.templates`) */
  titleKey: string
  /** i18n key for description (under `board.templates`) */
  descriptionKey: string
  icon: string
  /** Factory that produces nodes and connectors relative to a center point. */
  create: (centerX: number, centerY: number) => {
    nodes: Array<{
      type: string
      props: Record<string, unknown>
      xywh: [number, number, number, number]
    }>
    connectors: Array<{
      sourceIndex: number
      targetIndex: number
    }>
  }
}

const STICKY_SIZE: [number, number] = [200, 200]
const NODE_SIZE: [number, number] = DEFAULT_NODE_SIZE
const GAP = 80

/**
 * Text-to-image workflow: Sticky note -> AI Image generation
 */
const textToImage: WorkflowTemplate = {
  id: 'text-to-image',
  titleKey: 'textToImage',
  descriptionKey: 'textToImageDesc',
  icon: '\u{1F4DD}\u2192\u{1F5BC}\uFE0F',
  create: (cx, cy) => {
    const totalW = STICKY_SIZE[0] + GAP + NODE_SIZE[0]
    const startX = cx - totalW / 2

    return {
      nodes: [
        {
          type: 'text',
          props: { style: 'sticky', stickyColor: 'yellow', autoFocus: false },
          xywh: [
            startX,
            cy - STICKY_SIZE[1] / 2,
            STICKY_SIZE[0],
            STICKY_SIZE[1],
          ],
        },
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'ai-generated.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'ai-generate',
          },
          xywh: [
            startX + STICKY_SIZE[0] + GAP,
            cy - NODE_SIZE[1] / 2,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
      ],
      connectors: [{ sourceIndex: 0, targetIndex: 1 }],
    }
  },
}

/**
 * Image-to-video workflow: Image upload -> AI Video generation
 */
const imageToVideo: WorkflowTemplate = {
  id: 'image-to-video',
  titleKey: 'imageToVideo',
  descriptionKey: 'imageToVideoDesc',
  icon: '\u{1F5BC}\uFE0F\u2192\u{1F3AC}',
  create: (cx, cy) => {
    const totalW = NODE_SIZE[0] + GAP + NODE_SIZE[0]
    const startX = cx - totalW / 2

    return {
      nodes: [
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'upload.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'upload',
          },
          xywh: [startX, cy - NODE_SIZE[1] / 2, NODE_SIZE[0], NODE_SIZE[1]],
        },
        {
          type: 'video',
          props: {
            sourcePath: '',
            fileName: 'ai-generated.mp4',
            origin: 'ai-generate',
          },
          xywh: [
            startX + NODE_SIZE[0] + GAP,
            cy - NODE_SIZE[1] / 2,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
      ],
      connectors: [{ sourceIndex: 0, targetIndex: 1 }],
    }
  },
}

/**
 * Full pipeline: Sticky note -> AI Image -> AI Video
 */
const fullPipeline: WorkflowTemplate = {
  id: 'full-pipeline',
  titleKey: 'fullPipeline',
  descriptionKey: 'fullPipelineDesc',
  icon: '\u{1F4DD}\u2192\u{1F5BC}\uFE0F\u2192\u{1F3AC}',
  create: (cx, cy) => {
    const totalW = STICKY_SIZE[0] + GAP + NODE_SIZE[0] + GAP + NODE_SIZE[0]
    const startX = cx - totalW / 2

    return {
      nodes: [
        {
          type: 'text',
          props: { style: 'sticky', stickyColor: 'yellow', autoFocus: false },
          xywh: [
            startX,
            cy - STICKY_SIZE[1] / 2,
            STICKY_SIZE[0],
            STICKY_SIZE[1],
          ],
        },
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'ai-generated.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'ai-generate',
          },
          xywh: [
            startX + STICKY_SIZE[0] + GAP,
            cy - NODE_SIZE[1] / 2,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
        {
          type: 'video',
          props: {
            sourcePath: '',
            fileName: 'ai-generated.mp4',
            origin: 'ai-generate',
          },
          xywh: [
            startX + STICKY_SIZE[0] + GAP + NODE_SIZE[0] + GAP,
            cy - NODE_SIZE[1] / 2,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
      ],
      connectors: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 1, targetIndex: 2 },
      ],
    }
  },
}

/**
 * Storyboard mode: Text (script) -> 3 parallel image nodes
 */
const storyboard: WorkflowTemplate = {
  id: 'storyboard',
  titleKey: 'storyboard',
  descriptionKey: 'storyboardDesc',
  icon: '\u{1F4DD}\u2192\u{1F4F8}',
  create: (cx, cy) => {
    const imgGap = 40
    const totalImgH = NODE_SIZE[1] * 3 + imgGap * 2
    const totalW = STICKY_SIZE[0] + GAP + NODE_SIZE[0]
    const startX = cx - totalW / 2
    const imgX = startX + STICKY_SIZE[0] + GAP
    const imgStartY = cy - totalImgH / 2

    return {
      nodes: [
        {
          type: 'text',
          props: { style: 'sticky', stickyColor: 'blue', autoFocus: false },
          xywh: [
            startX,
            cy - STICKY_SIZE[1] / 2,
            STICKY_SIZE[0],
            STICKY_SIZE[1],
          ],
        },
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'storyboard-1.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'ai-generate',
          },
          xywh: [imgX, imgStartY, NODE_SIZE[0], NODE_SIZE[1]],
        },
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'storyboard-2.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'ai-generate',
          },
          xywh: [
            imgX,
            imgStartY + NODE_SIZE[1] + imgGap,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
        {
          type: 'image',
          props: {
            previewSrc: '',
            originalSrc: '',
            mimeType: 'image/png',
            fileName: 'storyboard-3.png',
            naturalWidth: NODE_SIZE[0],
            naturalHeight: NODE_SIZE[1],
            origin: 'ai-generate',
          },
          xywh: [
            imgX,
            imgStartY + (NODE_SIZE[1] + imgGap) * 2,
            NODE_SIZE[0],
            NODE_SIZE[1],
          ],
        },
      ],
      connectors: [
        { sourceIndex: 0, targetIndex: 1 },
        { sourceIndex: 0, targetIndex: 2 },
        { sourceIndex: 0, targetIndex: 3 },
      ],
    }
  },
}

/** All available workflow templates. */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  textToImage,
  imageToVideo,
  fullPipeline,
  storyboard,
]
