// ==========
// MVP：幂等 key 生成（用于 sourceKey 去重，避免断线重放重复执行）
// ==========

export function stableIdFromUrl(url: string) {
  let hash = 0;
  for (let i = 0; i < url.length; i += 1) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  return `open-url:${Math.abs(hash)}`;
}

