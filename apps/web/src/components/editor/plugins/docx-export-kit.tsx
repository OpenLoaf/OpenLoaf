'use client';

import { DocxExportPlugin } from '@platejs/docx-io';
import { KEYS } from 'platejs';

import { CalloutElementStatic } from '@tenas-ai/ui/callout-node-static';
import {
  CodeBlockElementStatic,
  CodeLineElementStatic,
  CodeSyntaxLeafStatic,
} from '@tenas-ai/ui/code-block-node-static';
import {
  ColumnElementStatic,
  ColumnGroupElementStatic,
} from '@tenas-ai/ui/column-node-static';
import {
  EquationElementStatic,
  InlineEquationElementStatic,
} from '@tenas-ai/ui/equation-node-static';
import { TocElementStatic } from '@tenas-ai/ui/toc-node-static';

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
