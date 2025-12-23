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
  // 中文注释：变量高度虚拟化（章节级）。精确滚动条 + 只渲染视区附近内容。
  const MAX_BLOCKS_PER_SECTION = 80; // 章节切分的兜底块数
  const OVERSCAN_SECTIONS = 3; // 视区前后各多渲染的章节数（加大以降低来回滚动时的重挂载感）
  const DEFAULT_EST_HEIGHT = 420; // 初始高度估算（像素）

  // 简单判断是否为标题块（以减少一次性渲染量）
  const isHeading = React.useCallback((n: any) => {
    const t = n?.type;
    return t === "h1" || t === "h2" || t === "h3";
  }, []);

  // 切分成章节：优先按 h2/h3，兜底每 MAX_BLOCKS_PER_SECTION 一段
  const sections = React.useMemo(() => {
    const out: { start: number; end: number }[] = [];
    if (!Array.isArray(initialValue) || initialValue.length === 0) {
      out.push({ start: 0, end: 0 });
      return out;
    }
    let start = 0;
    for (let i = 0; i < initialValue.length; i++) {
      const node = (initialValue as any[])[i];
      const reachSize = i - start >= MAX_BLOCKS_PER_SECTION;
      const splitAtHeading = i > start && isHeading(node) && (node.type === "h2" || node.type === "h3");
      if (reachSize || splitAtHeading) {
        out.push({ start, end: i });
        start = i;
      }
    }
    out.push({ start, end: (initialValue as any[]).length });
    return out;
  }, [initialValue, isHeading]);

  // 滚动容器 ref（独立滚动，保证我们精确控制与测量）
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  // 章节真实高度（未测量则使用估算）
  const [measuredHeights, setMeasuredHeights] = React.useState<Map<number, number>>(
    () => new Map(),
  );
  // 估算高度（基于块数的启发式）
  const estimatedHeights = React.useMemo(() => {
    const arr: number[] = new Array(sections.length).fill(DEFAULT_EST_HEIGHT);
    // 简单根据块数微调估算（越多块越高）
    for (let i = 0; i < sections.length; i++) {
      const { start, end } = sections[i];
      const blockCount = Math.max(1, end - start);
      arr[i] = Math.max(220, Math.min(1400, Math.round(blockCount * 14)));
    }
    // 读取上次测量缓存，进一步提高准确度
    try {
      const raw = window.localStorage.getItem("plate.sectionHeights.v1");
      if (raw) {
        const cache: Record<string, number> = JSON.parse(raw);
        for (const [k, v] of Object.entries(cache)) {
          const idx = Number(k);
          if (Number.isFinite(idx) && idx >= 0 && idx < arr.length && v > 0) {
            arr[idx] = v;
          }
        }
      }
    } catch {
      // ignore
    }
    return arr;
  }, [sections]);

  // 持久化测量结果（去抖合并）
  const persistTimer = React.useRef<number | null>(null);
  const persistHeights = React.useCallback((map: Map<number, number>) => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      const json: Record<string, number> = {};
      for (const [idx, h] of map.entries()) json[idx] = h;
      try {
        window.localStorage.setItem("plate.sectionHeights.v1", JSON.stringify(json));
      } catch {
        // ignore
      }
    }, 300);
  }, []);

  // 高度累计工具（真实优先）
  const sumHeights = React.useCallback(
    (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) {
        sum += measuredHeights.get(i) ?? estimatedHeights[i] ?? DEFAULT_EST_HEIGHT;
      }
      return sum;
    },
    [measuredHeights, estimatedHeights],
  );

  // 计算可视区渲染范围
  const [range, setRange] = React.useState({ start: 0, end: Math.min(4, sections.length - 1) });
  const recalcRange = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;

    // 找 start
    let acc = 0;
    let startIdx = 0;
    for (let i = 0; i < sections.length; i++) {
      const h = measuredHeights.get(i) ?? estimatedHeights[i] ?? DEFAULT_EST_HEIGHT;
      if (acc + h > top) {
        startIdx = i;
        break;
      }
      acc += h;
    }
    // 找 end
    let endIdx = startIdx;
    let acc2 = acc;
    for (let i = startIdx; i < sections.length; i++) {
      const h = measuredHeights.get(i) ?? estimatedHeights[i] ?? DEFAULT_EST_HEIGHT;
      acc2 += h;
      endIdx = i;
      if (acc2 >= bottom) break;
    }
    startIdx = Math.max(0, startIdx - OVERSCAN_SECTIONS);
    endIdx = Math.min(sections.length - 1, endIdx + OVERSCAN_SECTIONS);
    setRange((prev) => (prev.start === startIdx && prev.end === endIdx ? prev : { start: startIdx, end: endIdx }));
  }, [sections.length, measuredHeights, estimatedHeights]);

  // 滚动与尺寸变化监听
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        recalcRange();
      });
    };
    const ro = new ResizeObserver(onScroll);
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    recalcRange();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [recalcRange]);

  // 测量上报
  const handleMeasure = React.useCallback((index: number, height: number) => {
    setMeasuredHeights((prev) => {
      const old = prev.get(index);
      if (old === height) return prev;
      const next = new Map(prev);
      next.set(index, height);
      return next;
    });
  }, []);
  React.useEffect(() => {
    if (measuredHeights.size > 0) persistHeights(measuredHeights);
  }, [measuredHeights, persistHeights]);

  // 记录首屏初始化耗时（只读视图）
  const t0Ref = React.useRef<number>(performance.now());
  const loggedRef = React.useRef(false);
  React.useEffect(() => {
    if (loggedRef.current) return;
    // 首屏渲染后再输出日志
    const h = requestAnimationFrame(() => {
      loggedRef.current = true;
      const dt = Math.round(performance.now() - t0Ref.current);
      // eslint-disable-next-line no-console
      console.log(`[Plate][view] init ${pageId ?? "project-intro"}: ${dt}ms (sections=${sections.length})`);
    });
    return () => cancelAnimationFrame(h);
  }, [pageId, sections.length]);

  // 计算顶部/底部占位高度，确保滚动条精确
  const topSpacer = React.useMemo(() => sumHeights(0, range.start), [sumHeights, range.start]);
  const bottomSpacer = React.useMemo(
    () => sumHeights(range.end + 1, sections.length),
    [sumHeights, range.end, sections.length],
  );

  return (
    <div ref={scrollerRef} className="bg-background h-full w-full overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="relative w-full">
        {topSpacer > 0 && <div style={{ height: topSpacer }} />}

        {sections.slice(range.start, range.end + 1).map(({ start, end }, k) => {
          const i = range.start + k;
          const slice = (initialValue as any[]).slice(start, end) as Value;
          return (
            <MeasuredSection key={`sec-${i}`} index={i} onMeasure={handleMeasure}>
              <SectionStatic
                pageId={pageId}
                sectionIndex={i}
                totalSections={sections.length}
                value={slice}
              />
            </MeasuredSection>
          );
        })}

        {bottomSpacer > 0 && <div style={{ height: bottomSpacer }} />}
      </div>
    </div>
  );
}

/** 测量容器：用 ResizeObserver 上报真实高度（rAF 去抖），供虚拟化计算滚动条 */
function MeasuredSection({
  index,
  onMeasure,
  children,
}: {
  index: number;
  onMeasure: (index: number, height: number) => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = Math.round(entry.contentRect.height);
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => onMeasure(index, h));
    });
    ro.observe(el);
    // 初始上报一次
    rafId = requestAnimationFrame(() => onMeasure(index, Math.round(el.getBoundingClientRect().height)));
    return () => {
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [index, onMeasure]);
  return <div ref={ref}>{children}</div>;
}

/** 单节静态渲染组件（内部创建只读 editor） */
function SectionStatic({
  value,
  pageId,
  sectionIndex,
  totalSections,
}: {
  value: Value;
  pageId?: string;
  sectionIndex: number;
  totalSections: number;
}) {
  const editor = usePlateViewEditor(
    {
      id: `${pageId ?? "project-intro"}-view-${sectionIndex}`,
      enabled: true,
      plugins: BaseEditorKit,
      value,
    },
    [pageId, sectionIndex],
  );
  if (!editor) return null;
  return (
    <EditorStatic
      editor={editor}
      value={value}
      className="px-10 pt-1 text-sm"
      aria-label={`section ${sectionIndex + 1} of ${totalSections}`}
    />
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
