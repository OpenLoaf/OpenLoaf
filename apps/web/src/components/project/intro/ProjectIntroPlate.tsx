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
  // content 可能是任意可序列化的 JSON，渲染前再做校验与转换
  blocks: { content: unknown | null; order: number }[];
  pageTitle: string;
  readOnly?: boolean;
  pageId?: string;
}

/** 只读视图组件，避免创建完整编辑器实例 */
function ProjectInfoPlateView({
  initialValue,
  pageId,
}: {
  initialValue: Value;
  pageId?: string;
}) {
  // 中文注释：记录只读视图初始化耗时，便于定位首开卡顿
  const t0Ref = React.useRef<number>(performance.now());
  const loggedRef = React.useRef(false);
  const viewEditor = usePlateViewEditor(
    {
      id: pageId ? `${pageId}-view` : 'project-intro-view',
      enabled: true,
      plugins: BaseEditorKit,
      value: initialValue,
    },
    [pageId]
  );
  React.useEffect(() => {
    if (viewEditor && !loggedRef.current) {
      loggedRef.current = true;
      const dt = Math.round(performance.now() - t0Ref.current);
      // 仅在浏览器控制台输出简单耗时信息
      // eslint-disable-next-line no-console
      console.log(`[Plate][view] init ${pageId ?? 'project-intro'}: ${dt}ms`);
    }
  }, [viewEditor, pageId]);
  if (!viewEditor) return null;
  return (
    <div className="bg-background">
      <EditorStatic editor={viewEditor} value={initialValue} className="px-10 pt-1 text-sm" />
    </div>
  );
}

/** 可编辑视图组件，仅在需要时创建重型编辑器实例 */
function ProjectInfoPlateEdit({
  initialValue,
  pageId,
  onChange,
}: {
  initialValue: Value;
  pageId?: string;
  onChange: (value: Value) => void;
}) {
  // 中文注释：记录编辑器初始化耗时，重点观察重型实例的创建时间
  const t0Ref = React.useRef<number>(performance.now());
  const loggedRef = React.useRef(false);
  const editor = usePlateEditor(
    {
      id: pageId ?? 'project-intro',
      enabled: true,
      plugins: EditorKit,
      value: initialValue,
    },
    [pageId]
  );
  React.useEffect(() => {
    if (editor && !loggedRef.current) {
      loggedRef.current = true;
      const dt = Math.round(performance.now() - t0Ref.current);
      // eslint-disable-next-line no-console
      console.log(`[Plate][edit] init ${pageId ?? 'project-intro'}: ${dt}ms`);
    }
  }, [editor, pageId]);
  if (!editor) return null;
  return (
    <Plate editor={editor} onValueChange={({ value }) => onChange(value)}>
      <EditorContainer className="bg-background" data-allow-context-menu>
        <Editor readOnly={false} variant="none" className="px-10 pt-1 text-sm" />
      </EditorContainer>
    </Plate>
  );
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

  return readOnly ? (
    <ProjectInfoPlateView initialValue={initialValue} pageId={pageId} />
  ) : (
    <ProjectInfoPlateEdit
      initialValue={initialValue}
      pageId={pageId}
      onChange={(v) => scheduleSave(v)}
    />
  );
}
