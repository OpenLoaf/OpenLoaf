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

import { DocxExportPlugin } from '@platejs/docx-io';
import { KEYS } from 'platejs';

import { CalloutElementStatic } from '@openloaf/ui/callout-node-static';
import {
  CodeBlockElementStatic,
  CodeLineElementStatic,
  CodeSyntaxLeafStatic,
} from '@openloaf/ui/code-block-node-static';
import {
  ColumnElementStatic,
  ColumnGroupElementStatic,
} from '@openloaf/ui/column-node-static';
import {
  EquationElementStatic,
  InlineEquationElementStatic,
} from '@openloaf/ui/equation-node-static';
import { TocElementStatic } from '@openloaf/ui/toc-node-static';

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
