'use client';

import type { Value } from 'platejs';
import { createPlatePlugin } from 'platejs/react';
import { Editor as SlateEditor, type BaseEditor } from 'slate';

import {
  FILE_TOKEN_REGEX,
} from '@/components/ai/input/chat-input-utils';
import {
  buildInlineNodesFromText,
  normalizeSerializedForClipboard,
  serializeChatValue,
} from '@/components/editor/plugins/clipboard-kit-utils';

export const ClipboardKit = [
  createPlatePlugin({
    key: 'clipboard',
  }).overrideEditor(({ editor }) => {
    type ClipboardEditor = BaseEditor & {
      setFragmentData: (data: DataTransfer) => void;
      insertData: (data: DataTransfer) => void;
    };
    const slateEditor = editor as unknown as ClipboardEditor;
    const originalSetFragmentData = slateEditor.setFragmentData.bind(slateEditor);
    const originalInsertData = slateEditor.insertData.bind(slateEditor);

    slateEditor.setFragmentData = (data: DataTransfer) => {
      originalSetFragmentData(data);
      if (!editor.selection) return;
      const fragment = SlateEditor.fragment(slateEditor, editor.selection);
      const serialized = normalizeSerializedForClipboard(
        serializeChatValue(fragment as Value)
      );
      // 中文注释：覆写纯文本剪贴板格式，统一为文件引用格式。
      data.setData('text/plain', serialized);
    };

    slateEditor.insertData = (data: DataTransfer) => {
      const text = data.getData('text/plain');
      FILE_TOKEN_REGEX.lastIndex = 0;
      if (!text || !FILE_TOKEN_REGEX.test(text)) {
        originalInsertData(data);
        return;
      }
      // 中文注释：含有文件引用时，按自定义协议解析并插入。
      editor.tf.withoutNormalizing(() => {
        const lines = text.split('\n');
        lines.forEach((line: string, index: number) => {
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
