declare module 'pdf-parse' {
  interface PdfParsePage {
    text: string
    num: number
  }
  interface PdfParseTextResult {
    pages: PdfParsePage[]
    text: string
    total: number
  }
  interface PdfParseScreenshot {
    data: Uint8Array
    dataUrl: string
    pageNumber: number
    width: number
    height: number
    scale: number
  }
  interface PdfParseScreenshotResult {
    pages: PdfParseScreenshot[]
    total: number
  }
  interface PdfParseParameters {
    partial?: number[]
    first?: number
    last?: number
    scale?: number
    desiredWidth?: number
    imageDataUrl?: boolean
    imageBuffer?: boolean
  }
  class PDFParse {
    constructor(data: Uint8Array)
    getText(params?: PdfParseParameters): Promise<PdfParseTextResult>
    getScreenshot(params?: PdfParseParameters): Promise<PdfParseScreenshotResult>
    getInfo(): Promise<Record<string, any>>
    destroy(): Promise<void>
  }
  export { PDFParse }
}
