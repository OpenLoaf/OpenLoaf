/**
 * PDF 字体加载工具 — 为 pdf-lib 提供中文字体支持。
 *
 * 英文内容使用 StandardFonts（零开销），
 * 检测到中文/日文/韩文时自动加载 Noto Sans SC（延迟加载，仅首次读盘）。
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { StandardFonts } from 'pdf-lib'
import type { PDFDocument, PDFFont } from 'pdf-lib'

/** Detect CJK and other non-Latin characters that StandardFonts cannot render */
export function hasNonLatinChars(text: string): boolean {
  // biome-ignore lint/suspicious/noMisleadingCharacterClass: intentional CJK detection
  return /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0e00-\u0e7f]/.test(text)
}

/** Check if any string in an array contains non-Latin characters */
export function anyHasNonLatin(texts: string[]): boolean {
  return texts.some(hasNonLatinChars)
}

// Cached font bytes — only read from disk once
let cachedCjkFontBytes: Uint8Array | null = null

async function loadCjkFontBytes(): Promise<Uint8Array> {
  if (cachedCjkFontBytes) return cachedCjkFontBytes

  // Resolve font path relative to this file's location
  // In dev: apps/server/src/ai/tools/office/ → apps/server/assets/fonts/
  // In prod: dist/ → assets/fonts/ (bundled alongside server.mjs)
  const candidates = [
    path.resolve(__dirname, '../../../../assets/fonts/NotoSansSC-Regular.ttf'),
    path.resolve(__dirname, '../../../assets/fonts/NotoSansSC-Regular.ttf'),
    path.resolve(process.cwd(), 'assets/fonts/NotoSansSC-Regular.ttf'),
  ]

  for (const p of candidates) {
    try {
      const bytes = await fs.readFile(p)
      cachedCjkFontBytes = new Uint8Array(bytes)
      return cachedCjkFontBytes
    } catch {
      // try next
    }
  }

  throw new Error(
    '未找到中文字体文件 NotoSansSC-Regular.ttf。' +
    '请确认 apps/server/assets/fonts/NotoSansSC-Regular.ttf 存在。',
  )
}

async function registerFontkit(pdfDoc: PDFDocument): Promise<void> {
  const fontkit = (await import('@pdf-lib/fontkit')).default
  pdfDoc.registerFontkit(fontkit)
}

export type PdfFontSet = {
  regular: PDFFont
  bold: PDFFont
  italic: PDFFont
  cjk: boolean
}

/**
 * 为 PDFDocument 嵌入字体。
 * 如果 contentTexts 包含中文等非拉丁字符，自动加载 Noto Sans SC。
 * 否则使用 StandardFonts（不需要额外字体文件）。
 */
export async function embedFonts(
  pdfDoc: PDFDocument,
  contentTexts: string[],
): Promise<PdfFontSet> {
  const needsCjk = anyHasNonLatin(contentTexts)

  if (!needsCjk) {
    return {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
      cjk: false,
    }
  }

  // CJK path: use Noto Sans SC for all font variants
  await registerFontkit(pdfDoc)
  const fontBytes = await loadCjkFontBytes()
  const font = await pdfDoc.embedFont(fontBytes)

  return {
    regular: font,
    bold: font, // Noto Sans SC variable font — same file for bold
    italic: font, // No italic variant, use regular
    cjk: true,
  }
}

/**
 * 为单个字体嵌入场景（如 text overlay）提供简化接口。
 */
export async function embedFont(
  pdfDoc: PDFDocument,
  text: string,
): Promise<PDFFont> {
  if (!hasNonLatinChars(text)) {
    return pdfDoc.embedFont(StandardFonts.Helvetica)
  }
  await registerFontkit(pdfDoc)
  const fontBytes = await loadCjkFontBytes()
  return pdfDoc.embedFont(fontBytes)
}
