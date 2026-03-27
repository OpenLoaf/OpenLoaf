/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { AutoformatRule } from '@platejs/autoformat'

import {
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from '@platejs/basic-nodes/react'
import { AutoformatPlugin } from '@platejs/autoformat'
import { IndentPlugin } from '@platejs/indent/react'
import { ListPlugin } from '@platejs/list/react'
import { toggleList } from '@platejs/list'
import { ExitBreakPlugin, KEYS } from 'platejs'

import {
  BoardH1Element,
  BoardH2Element,
  BoardH3Element,
  BoardH4Element,
  BoardH5Element,
  BoardH6Element,
} from './BoardHeading'
import { BoardBlockList } from './BoardBlockList'

/** Autoformat rules — marks subset for inline formatting. */
const boardAutoformatMarks: AutoformatRule[] = [
  { match: '**', mode: 'mark', type: KEYS.bold },
  { match: '*', mode: 'mark', type: KEYS.italic },
  { match: '_', mode: 'mark', type: KEYS.italic },
  { match: '__', mode: 'mark', type: KEYS.underline },
  { match: '~~', mode: 'mark', type: KEYS.strikethrough },
]

/** Autoformat rules — heading shortcuts keep Markdown input consistent with preview. */
const boardAutoformatHeadings: AutoformatRule[] = [
  { match: '# ', mode: 'block', type: KEYS.h1 },
  { match: '## ', mode: 'block', type: KEYS.h2 },
  { match: '### ', mode: 'block', type: KEYS.h3 },
  { match: '#### ', mode: 'block', type: KEYS.h4 },
  { match: '##### ', mode: 'block', type: KEYS.h5 },
  { match: '###### ', mode: 'block', type: KEYS.h6 },
]

/** Autoformat rules — list shortcuts for block formatting. */
const boardAutoformatLists: AutoformatRule[] = [
  {
    match: ['* ', '- '],
    mode: 'block',
    type: 'list',
    format: (editor) => {
      toggleList(editor, { listStyleType: KEYS.ul })
    },
  },
  {
    match: [String.raw`^\d+\.$ `, String.raw`^\d+\)$ `],
    matchByRegex: true,
    mode: 'block',
    type: 'list',
    format: (editor, { matchString }) => {
      toggleList(editor, {
        listRestartPolite: Number(matchString) || 1,
        listStyleType: KEYS.ol,
      })
    },
  },
  {
    match: ['[] '],
    mode: 'block',
    type: 'list',
    format: (editor) => {
      toggleList(editor, { listStyleType: KEYS.listTodo })
      editor.tf.setNodes({ checked: false, listStyleType: KEYS.listTodo })
    },
  },
  {
    match: ['[x] '],
    mode: 'block',
    type: 'list',
    format: (editor) => {
      toggleList(editor, { listStyleType: KEYS.listTodo })
      editor.tf.setNodes({ checked: true, listStyleType: KEYS.listTodo })
    },
  },
]

/**
 * Read-only Plate plugin kit for Board TextNode.
 *
 * Only includes rendering-essential plugins: Headings (H1–H6), Indent, List.
 * Mark plugins (Bold, Italic, etc.) are omitted because Slate handles mark
 * rendering natively. Autoformat and ExitBreak are omitted because users
 * do not type or edit in read-only mode.
 */
export const ReadOnlyBoardTextEditorKit = [
  // Headings — render only, no break rules needed
  H1Plugin.configure({
    node: { component: BoardH1Element },
  }),
  H2Plugin.configure({
    node: { component: BoardH2Element },
  }),
  H3Plugin.configure({
    node: { component: BoardH3Element },
  }),
  H4Plugin.configure({
    node: { component: BoardH4Element },
  }),
  H5Plugin.configure({
    node: { component: BoardH5Element },
  }),
  H6Plugin.configure({
    node: { component: BoardH6Element },
  }),

  // Indent (required by ListPlugin)
  IndentPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
      ],
    },
    options: { offset: 24 },
  }),

  // List
  ListPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
      ],
    },
    render: { belowNodes: BoardBlockList },
  }),
]

/**
 * Full Plate plugin kit for editable Board TextNode.
 *
 * Includes: Bold, Italic, Underline, Strikethrough, Headings (H1–H6),
 * Indent, List (ul/ol/todo), Autoformat (markdown shortcuts), ExitBreak.
 */
export const EditableBoardTextEditorKit = [
  // Inline marks
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin.configure({
    shortcuts: { toggle: { keys: 'mod+shift+x' } },
  }),

  // Headings
  H1Plugin.configure({
    node: {
      component: BoardH1Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),
  H2Plugin.configure({
    node: {
      component: BoardH2Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),
  H3Plugin.configure({
    node: {
      component: BoardH3Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),
  H4Plugin.configure({
    node: {
      component: BoardH4Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),
  H5Plugin.configure({
    node: {
      component: BoardH5Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),
  H6Plugin.configure({
    node: {
      component: BoardH6Element,
    },
    rules: {
      break: { empty: 'reset' },
    },
  }),

  // Indent (required by ListPlugin)
  IndentPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
      ],
    },
    options: { offset: 24 },
  }),

  // List
  ListPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
      ],
    },
    render: { belowNodes: BoardBlockList },
  }),

  // Autoformat — markdown shortcuts
  AutoformatPlugin.configure({
    options: {
      enableUndoOnDelete: true,
      // 逻辑：标题规则先于列表规则注册，避免 `#` 开头在白板节点里退化成普通文本。
      rules: [
        ...boardAutoformatMarks,
        ...boardAutoformatHeadings,
        ...boardAutoformatLists,
      ],
    },
  }),

  // Exit break — Mod+Enter inserts a new block below
  ExitBreakPlugin.configure({
    shortcuts: {
      insert: { keys: 'mod+enter' },
    },
  }),
]

/** Backward-compatible alias — points to the full editable kit. */
export const BoardTextEditorKit = EditableBoardTextEditorKit
