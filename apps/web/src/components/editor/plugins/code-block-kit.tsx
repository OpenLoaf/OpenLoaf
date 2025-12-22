'use client';

import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from '@platejs/code-block/react';
import { all, createLowlight } from 'lowlight';

import { CodeLineElement, CodeSyntaxLeaf } from '@/components/ui/code-block-node';
import { TeatimeCodeBlockElement } from '@/components/editor/teatime/TeatimeCodeBlockElement';

const lowlight = createLowlight(all);
// 中文注释：注册空的 mermaid 语言，避免高亮报错。
lowlight.register('mermaid', () => ({ contains: [] }));

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    node: { component: TeatimeCodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
