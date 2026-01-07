/** 统一 OpenAI 兼容服务的 baseURL 格式。 */
export function ensureOpenAiCompatibleBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}
