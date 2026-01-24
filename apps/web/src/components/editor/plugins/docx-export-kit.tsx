'use client';

import { DocxExportPlugin } from '@platejs/docx-io';
import { KEYS } from 'platejs';

import { CalloutElementStatic } from '@/components/ui/callout-node-static';
import {
  CodeBlockElementStatic,
  CodeLineElementStatic,
  CodeSyntaxLeafStatic,
} from '@/components/ui/code-block-node-static';
import {
  ColumnElementStatic,
  ColumnGroupElementStatic,
} from '@/components/ui/column-node-static';
import {
  EquationElementStatic,
  InlineEquationElementStatic,
} from '@/components/ui/equation-node-static';
import { TocElementStatic } from '@/components/ui/toc-node-static';

/** DocxExportKit provides export-time overrides for DOCX serialization. */
export const DocxExportKit = [
  DocxExportPlugin.configure({
    override: {
      components: {
        [KEYS.codeBlock]: CodeBlockElementStatic,
        [KEYS.codeLine]: CodeLineElementStatic,
        [KEYS.codeSyntax]: CodeSyntaxLeafStatic,
        [KEYS.column]: ColumnElementStatic,
        [KEYS.columnGroup]: ColumnGroupElementStatic,
        [KEYS.equation]: EquationElementStatic,
        [KEYS.inlineEquation]: InlineEquationElementStatic,
        [KEYS.callout]: CalloutElementStatic,
        [KEYS.toc]: TocElementStatic,
      },
    },
  }),
];
