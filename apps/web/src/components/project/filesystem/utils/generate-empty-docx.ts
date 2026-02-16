import { exportToDocx } from '@platejs/docx-io'
import type { Value } from 'platejs'

import { BaseEditorKit } from '@/components/editor/editor-base-kit'
import { DocxExportKit } from '@/components/editor/plugins/docx-export-kit'
import { EditorStatic } from '@tenas-ai/ui/editor-static'

/** Minimal Plate.js value for an empty document. */
const EMPTY_DOC_VALUE: Value = [
  { type: 'p', children: [{ text: '' }] },
]

/** Encode an ArrayBuffer to a base64 string. */
function encodeArrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/** Generate a minimal empty docx file and return its base64 content. */
export async function generateEmptyDocx(): Promise<string> {
  const blob = await exportToDocx(EMPTY_DOC_VALUE, {
    editorPlugins: [...BaseEditorKit, ...DocxExportKit] as any,
    editorStaticComponent: EditorStatic,
  })
  const buffer = await blob.arrayBuffer()
  return encodeArrayBufferToBase64(buffer)
}
