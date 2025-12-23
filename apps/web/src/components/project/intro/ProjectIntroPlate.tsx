'use client';

import * as React from 'react';

import { useMutation } from '@tanstack/react-query';
import type { Value } from 'platejs';
import { Plate, usePlateEditor, usePlateViewEditor } from 'platejs/react';

import { EditorKit } from '@/components/editor/editor-kit';
import { BaseEditorKit } from '@/components/editor/editor-base-kit';
import { EditorStatic } from '@/components/ui/editor-static';
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
  const saveBlocks = useMutation(
    trpc.pageCustom.saveBlocks.mutationOptions()
  );
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValueRef = React.useRef<string>('');
  const isHydratingRef = React.useRef(false);

  /** Check whether the editor node is empty. */
  const isEmptyNode = React.useCallback((node: unknown): boolean => {
    if (!node || typeof node !== 'object') return true;
    if ('text' in node) {
      const textValue = (node as { text?: string }).text ?? '';
      return textValue.trim().length === 0;
    }
    if ('children' in node) {
      const childrenValue = (node as { children?: unknown[] }).children ?? [];
      if (!Array.isArray(childrenValue) || childrenValue.length === 0) return true;
      return childrenValue.every(isEmptyNode);
    }
    return false;
  }, []);

  const initialValue = React.useMemo(() => {
    const ordered = [...blocks].sort((a, b) => a.order - b.order);
    const fallbackValue: Value = [
      { type: 'h1', children: [{ text: pageTitle }] },
      {
        type: 'p',
        children: [{ text: '在这里写项目简介（支持 Markdown / MDX）。' }],
      },
    ];
    const orderedBlocks = ordered.map((block) => block.content).filter(Boolean);
    // 中文注释：全部为空内容时显示默认文案，避免渲染一个空段落。
    const shouldUseFallback =
      orderedBlocks.length === 0 ||
      orderedBlocks.every((block) => isEmptyNode(block));
    return (shouldUseFallback ? fallbackValue : orderedBlocks) as Value;
  }, [blocks, pageTitle, isEmptyNode]);

  const editor = usePlateEditor(
    {
      id: pageId ?? 'project-intro',
      enabled: !readOnly,
      plugins: EditorKit,
      value: initialValue,
    },
    [pageId]
  );
  const viewEditor = usePlateViewEditor(
    {
      id: pageId ? `${pageId}-view` : 'project-intro-view',
      enabled: readOnly,
      // 中文注释：只读视图用基础插件，避免依赖 Plate 上下文的交互组件。
      plugins: BaseEditorKit,
      value: initialValue,
    },
    [pageId]
  );

  React.useEffect(() => {
    // 中文注释：初始化内容时跳过自动保存，避免误写。
    isHydratingRef.current = true;
    lastValueRef.current = JSON.stringify(initialValue);
    queueMicrotask(() => {
      isHydratingRef.current = false;
    });
  }, [initialValue]);

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

  if (readOnly) {
    if (!viewEditor) return null;
    return (
      <div className="bg-background">
        {/* 中文注释：只读模式使用静态渲染，减少事件与编辑开销。 */}
        <EditorStatic
          editor={viewEditor}
          value={initialValue}
          className="px-10 pt-1 text-sm"
        />
      </div>
    );
  }

  if (!editor) return null;

  return (
    <Plate editor={editor} onValueChange={({ value }) => scheduleSave(value)}>
      <EditorContainer className="bg-background" data-allow-context-menu>
        <Editor
          readOnly={readOnly}
          // variant="fullWidth"
          variant="none"
          className="px-10 pt-1 text-sm"
        />
      </EditorContainer>
    </Plate>
  );
}
