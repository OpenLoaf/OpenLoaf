/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Pure type definitions for text nodes. This file must NOT import from
 * engine, tools, or any React component to avoid circular dependencies.
 */
import type { Value } from 'platejs'
import type { NodeOrigin } from '../board-contracts'

/** Text value stored on the text node (rich text Value or legacy string). */
export type TextNodeValue = string | Value

/** Supported text alignment for text nodes. */
export type TextNodeTextAlign = 'left' | 'center' | 'right'

/** Visual style variant for text nodes. */
export type TextNodeStyle = 'plain' | 'sticky' | 'shape'

/** Preset sticky note colors. */
export type StickyColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange'

/** Shape sub-types for style='shape'. */
export type ShapeType = 'rectangle' | 'rounded_rectangle' | 'ellipse' | 'diamond' | 'triangle'

export type TextNodeProps = {
  /** Text content stored on the node. */
  value: TextNodeValue
  /** Whether the node should auto-enter edit mode on mount. */
  autoFocus?: boolean
  /** Collapsed height stored as view baseline size. */
  collapsedHeight?: number
  /** Font size for the text node. */
  fontSize?: number
  /** Font weight for the text node (legacy — kept for backward compat). */
  fontWeight?: number
  /** Font style for the text node (legacy — kept for backward compat). */
  fontStyle?: 'normal' | 'italic'
  /** Text decoration for the text node (legacy — kept for backward compat). */
  textDecoration?: 'none' | 'underline' | 'line-through'
  /** Text alignment for the text node. */
  textAlign?: TextNodeTextAlign
  /** Custom text color for the text node. */
  color?: string
  /** Custom background color for the text node. */
  backgroundColor?: string
  /** Render the node as a read-only chat projection. */
  readOnlyProjection?: boolean
  /** Markdown text shown in read-only chat projection mode. */
  markdownText?: string
  /** Visual style variant: 'plain' (default), 'sticky' (colored note), or 'shape'. */
  style?: TextNodeStyle
  /** Sticky note color preset. Only used when style is 'sticky'. */
  stickyColor?: StickyColor
  /** Shape sub-type. Only used when style is 'shape'. */
  shapeType?: ShapeType
  /** Shape fill color. Only used when style is 'shape'. */
  shapeFill?: string
  /** Shape stroke color. Only used when style is 'shape'. */
  shapeStroke?: string
  /** Shape stroke width in px. Only used when style is 'shape'. */
  shapeStrokeWidth?: number
  /** How the text node was created. */
  origin?: NodeOrigin
}
