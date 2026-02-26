'use client';

import * as React from 'react';

import type { TCodeBlockElement } from 'platejs';
import { NodeApi } from 'platejs';
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react';

import { CodeBlockElement } from '@openloaf/ui/code-block-node';

import { MermaidBlock } from './MermaidBlock';

/** Code block element with Mermaid preview support. */
export function OpenLoafCodeBlockElement(
  props: PlateElementProps<TCodeBlockElement>
) {
  const { element } = props;
  const readOnly = useReadOnly();
  const [showSource, setShowSource] = React.useState(false);
  const isMermaid = element.lang === 'mermaid';
  const codeText = React.useMemo(() => NodeApi.string(element), [element]);

  React.useEffect(() => {
    if (readOnly) setShowSource(false);
  }, [readOnly]);

  if (!isMermaid || showSource) {
    return <CodeBlockElement {...props} />;
  }

  return (
    <PlateElement className="py-1" {...props}>
      <div
        className="relative rounded-md bg-muted/50 p-4"
        contentEditable={false}
        onClick={() => {
          if (readOnly) return;
          setShowSource(true);
        }}
      >
        {/* 中文注释：Mermaid 默认渲染预览，点击进入源码编辑。 */}
        <MermaidBlock code={codeText} />
        {!readOnly && (
          <button
            type="button"
            className="absolute top-2 right-2 rounded-md border border-border bg-background/80 px-2 py-0.5 text-xs text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation();
              setShowSource(true);
            }}
          >
            编辑源码
          </button>
        )}
      </div>
      <div className="sr-only">{props.children}</div>
    </PlateElement>
  );
}
