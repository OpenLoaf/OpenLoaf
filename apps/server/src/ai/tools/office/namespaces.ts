/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** OOXML namespace registry for XPath queries. */
export const OOXML_NS: Record<string, string> = {
  // WordprocessingML
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  // SpreadsheetML
  x: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  // PresentationML
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  // DrawingML
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  // Relationships
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  // Word Drawing
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  // Picture
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  // Content Types
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  // Package Relationships
  pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
  // Markup Compatibility
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  // Word 2010
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  // Excel 2010
  x14: 'http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',
}

/** Detect format-specific namespaces from a ZIP entry path. */
export function detectNamespaces(entryPath: string): Record<string, string> {
  const ns: Record<string, string> = { r: OOXML_NS.r! }
  if (entryPath.startsWith('word/')) {
    ns.w = OOXML_NS.w!
    ns.wp = OOXML_NS.wp!
    ns.a = OOXML_NS.a!
    ns.pic = OOXML_NS.pic!
  } else if (entryPath.startsWith('xl/')) {
    ns.x = OOXML_NS.x!
    ns.a = OOXML_NS.a!
  } else if (entryPath.startsWith('ppt/')) {
    ns.p = OOXML_NS.p!
    ns.a = OOXML_NS.a!
    ns.pic = OOXML_NS.pic!
  } else if (entryPath === '[Content_Types].xml') {
    ns.ct = OOXML_NS.ct!
  } else if (entryPath.includes('_rels/')) {
    ns.pr = OOXML_NS.pr!
  }
  return ns
}
