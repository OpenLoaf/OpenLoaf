'use client';

import * as React from 'react';

import { isLangSupported } from '@platejs/code-block';
import { useMutation } from '@tanstack/react-query';
import type { Value } from 'platejs';
import { Plate, usePlateEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { trpc } from '@/utils/trpc';

interface ProjectInfoPlateProps {
  blocks: { content: Record<string, unknown> | null; order: number }[];
  pageTitle: string;
  readOnly?: boolean;
  pageId?: string;
}

/** Project intro editor. */
export function ProjectInfoPlate({
  blocks,
  pageTitle,
  readOnly = true,
  pageId,
}: ProjectInfoPlateProps) {
  const editor = usePlateEditor({
    plugins: [
      ...EditorKit,
    ],
    value: [],
  });
  const saveBlocks = useMutation(
    trpc.pageCustom.saveBlocks.mutationOptions()
  );
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValueRef = React.useRef<string>('');
  const isHydratingRef = React.useRef(false);

  /** Normalize unsupported code block languages. */
  const normalizeValue = React.useCallback((value: Value): Value => {
    const normalizeNode = (node: unknown): unknown => {
      if (!node || typeof node !== 'object') return node;
      const next = { ...(node as Record<string, unknown>) };
      if (next.type === 'code_block') {
        const lang = typeof next.lang === 'string' ? next.lang : undefined;
        // 中文注释：保留 mermaid，其它不支持的语言降级为纯文本，避免高亮报错。
        next.lang =
          lang === 'mermaid'
            ? 'mermaid'
            : lang && isLangSupported(lang)
              ? lang
              : 'plaintext';
      }
      if (Array.isArray(next.children)) {
        next.children = next.children.map(normalizeNode);
      }
      return next;
    };

    return value.map((node) => normalizeNode(node)) as Value;
  }, []);

  React.useEffect(() => {
    const ordered = [...blocks].sort((a, b) => a.order - b.order);
    const fallbackValue: Value = [
      { type: 'h1', children: [{ text: pageTitle }] },
      {
        type: 'p',
        children: [{ text: '在这里写项目简介（支持 Markdown / MDX）。' }],
      },
    ];
    const nextValue =
      ordered.length > 0
        ? ordered.map((block) => block.content).filter(Boolean)
        : fallbackValue;
    const normalizedValue = normalizeValue(nextValue as Value);

    // 中文注释：初始化内容时跳过自动保存，避免误写。
    isHydratingRef.current = true;
    editor.tf.setValue(normalizedValue);
    lastValueRef.current = JSON.stringify(normalizedValue);
    queueMicrotask(() => {
      isHydratingRef.current = false;
    });
  }, [editor, blocks, pageTitle, normalizeValue]);

  /** Debounced block save handler. */
  const scheduleSave = React.useCallback(
    (value: Value) => {
      if (!pageId || readOnly || isHydratingRef.current) return;
      const nextValue = JSON.stringify(value);
      if (nextValue === lastValueRef.current) return;
      lastValueRef.current = nextValue;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // 中文注释：输入过程中合并保存，避免频繁写库。
      saveTimerRef.current = setTimeout(() => {
        const blockPayload = value.map((node, index) => ({
          content: node as Record<string, unknown>,
          order: index,
          type: (node as { type?: string }).type ?? 'paragraph',
        }));
        saveBlocks.mutate({ pageId, blocks: blockPayload });
      }, 800);
    },
    [pageId, readOnly, saveBlocks]
  );

  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <Plate editor={editor} onValueChange={({ value }) => scheduleSave(value)}>
      <EditorContainer className="bg-background" data-allow-context-menu>
        <Editor
          readOnly={readOnly}
          variant="fullWidth"
          // variant="select"
          className="px-3 py-0 text-sm"
        />
      </EditorContainer>
    </Plate>
  );
}
