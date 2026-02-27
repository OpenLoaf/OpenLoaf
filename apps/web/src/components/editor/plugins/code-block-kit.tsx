/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client';

import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from '@platejs/code-block/react';
import { all, createLowlight } from 'lowlight';

import { CodeLineElement, CodeSyntaxLeaf } from '@openloaf/ui/code-block-node';
import { OpenLoafCodeBlockElement } from '@/components/editor/openloaf/OpenLoafCodeBlockElement';

const lowlight = createLowlight(all);
// 中文注释：注册空的 mermaid 语言，避免高亮报错。
lowlight.register('mermaid', () => ({ contains: [] }));

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    node: { component: OpenLoafCodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
