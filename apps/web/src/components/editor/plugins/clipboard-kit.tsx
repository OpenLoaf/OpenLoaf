'use client';

import type { Value } from 'platejs';
import { createPlatePlugin } from 'platejs/react';
import { Editor as SlateEditor } from 'slate';

import {
  buildInlineNodesFromText,
  normalizeSerializedForClipboard,
  serializeChatValue,
} from '@/components/chat/chat-input-utils';

export const ClipboardKit = [
  createPlatePlugin({
    key: 'clipboard',
  }).overrideEditor(({ editor }) => {
    const originalSetFragmentData = editor.setFragmentData.bind(editor);
    const originalInsertData = editor.insertData.bind(editor);

    editor.setFragmentData = (data) => {
      originalSetFragmentData(data);
      if (!editor.selection) return;
      const fragment = SlateEditor.fragment(editor, editor.selection);
      const serialized = normalizeSerializedForClipboard(
        serializeChatValue(fragment as Value)
      );
      // 中文注释：覆写纯文本剪贴板格式，统一为 @{...} 协议。
      data.setData('text/plain', serialized);
    };

    editor.insertData = (data) => {
      const text = data.getData('text/plain');
      if (!text || !text.includes('@{')) {
        originalInsertData(data);
        return;
      }
      // 中文注释：含有文件引用时，按自定义协议解析并插入。
      editor.tf.withoutNormalizing(() => {
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          const inlineNodes = buildInlineNodesFromText(line);
          editor.tf.insertNodes(inlineNodes, { select: true });
          if (index < lines.length - 1) {
            editor.tf.insertText('\n');
          }
        });
      });
      editor.tf.focus();
    };

    return editor;
  }),
];
