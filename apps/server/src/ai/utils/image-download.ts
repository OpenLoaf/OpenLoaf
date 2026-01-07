import { Buffer } from "node:buffer";

/** data: URL 前缀。 */
const DATA_URL_PREFIX = "data:";

/** 解析 data: URL 为二进制数据。 */
function parseDataUrl(dataUrl: string): Uint8Array {
  const [, base64] = dataUrl.split(",", 2);
  if (!base64) {
    throw new Error("data URL 缺少 base64 内容");
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** 下载图片并转换为二进制数据。 */
export async function downloadImageData(
  url: string,
  abortSignal?: AbortSignal,
): Promise<Uint8Array> {
  if (url.startsWith(DATA_URL_PREFIX)) {
    return parseDataUrl(url);
  }
  const response = await fetch(url, { signal: abortSignal });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`图片下载失败: ${response.status} ${text}`.trim());
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}
