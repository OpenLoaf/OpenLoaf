/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const docPreviewToolDef = {
  id: "DocPreview",
  readonly: true,
  name: "Document Preview",
  description: `Fast preview / full extraction for Office documents (PDF / DOCX / XLSX / PPTX).

- mode='preview' (default): cheap local-only preview — page count / sheet list / slide titles / first-page snippet, typically <2KB
- mode='full': complete Markdown body + extracted images written to {basename}_asset/
- Auto-detects format from file extension / MIME. Use Read for text files; Read delegates office preview here automatically.
- pageRange (PDF only) and sheetName (XLSX only) apply to both modes.`,
  parameters: z.object({
    file_path: z
      .string()
      .min(1)
      .describe("Absolute or project-relative path to a pdf/docx/xlsx/pptx file."),
    mode: z
      .enum(["preview", "full"])
      .optional()
      .describe("Default 'preview'."),
    pageRange: z
      .string()
      .optional()
      .describe('PDF page range, e.g. "1-5".'),
    sheetName: z
      .string()
      .optional()
      .describe("XLSX sheet name."),
  }),
  component: null,
} as const;
