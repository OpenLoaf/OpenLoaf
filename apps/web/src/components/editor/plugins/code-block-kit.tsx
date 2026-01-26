'use client';

import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from '@platejs/code-block/react';
import { all, createLowlight } from 'lowlight';

import { CodeLineElement, CodeSyntaxLeaf } from '@tenas-ai/ui/code-block-node';
import { TenasCodeBlockElement } from '@/components/editor/tenas/TenasCodeBlockElement';

const lowlight = createLowlight(all);
// 中文注释：注册空的 mermaid 语言，避免高亮报错。
lowlight.register('mermaid', () => ({ contains: [] }));

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    node: { component: TenasCodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: 'mod+alt+8' } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
