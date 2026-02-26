/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client';

import * as React from 'react';

import { MermaidDiagram } from '@lightenna/react-mermaid-diagram';

interface MermaidBlockProps {
  code: string;
}

/** Mermaid preview renderer. */
export function MermaidBlock({ code }: MermaidBlockProps) {
  const diagram = React.useMemo(() => code.trim(), [code]);

  return (
    <div className="w-full">
      {diagram ? (
        // 中文注释：使用 Mermaid 组件渲染预览图。
        <MermaidDiagram>{diagram}</MermaidDiagram>
      ) : (
        <div className="text-xs text-muted-foreground">Mermaid 为空</div>
      )}
    </div>
  );
}
