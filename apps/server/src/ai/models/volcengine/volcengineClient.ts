import { createHash, createHmac } from "node:crypto";
import {
  VOLCENGINE_CONTENT_TYPE,
  VOLCENGINE_REGION,
  VOLCENGINE_SERVICE,
  VOLCENGINE_VERSION,
  type VolcengineProviderConfig,
} from "./volcengineConfig";

const SIGNED_HEADERS = "host;x-date;x-content-sha256;content-type";

type VolcengineRequest = {
  /** Request url. */
  url: string;
  /** HTTP method. */
  method: "POST";
  /** Signed headers. */
  headers: Record<string, string>;
  /** JSON body. */
  body: string;
};

/** Build Volcengine signed request for action. */
export function buildVolcengineRequest(
  config: VolcengineProviderConfig,
  action: string,
  payload: Record<string, unknown>,
): VolcengineRequest {
  const url = new URL(config.apiUrl);
  const path = url.pathname || "/";
  const query = {
    Action: action,
    Version: VOLCENGINE_VERSION,
  };
  const body = JSON.stringify(cleanPayload(payload));
  const headers = buildSignedHeaders({
    method: "POST",
    host: url.host,
    path,
    query,
    body,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const requestUrl = `${url.origin}${path}?${buildQueryString(query)}`;
  return {
    url: requestUrl,
    method: "POST",
    headers,
    body,
  };
}

/** Remove undefined fields from payload. */
function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

/** Build signed headers for Volcengine HMAC-SHA256 auth. */
function buildSignedHeaders(input: {
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  body: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Record<string, string> {
  const xDate = formatXDate(new Date());
  const payloadHash = sha256Hex(input.body);
  const canonicalQuery = buildQueryString(input.query);
  const canonicalHeaders = [
    `host:${input.host}`,
    `x-date:${xDate}`,
    `x-content-sha256:${payloadHash}`,
    `content-type:${VOLCENGINE_CONTENT_TYPE}`,
  ].join("\n");
  const canonicalRequest = [
    input.method,
    input.path,
    canonicalQuery,
    canonicalHeaders,
    "",
    SIGNED_HEADERS,
    payloadHash,
  ].join("\n");
  const credentialScope = `${xDate.slice(0, 8)}/${VOLCENGINE_REGION}/${VOLCENGINE_SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacSha256Hex(
    getSigningKey(input.secretAccessKey, xDate.slice(0, 8)),
    stringToSign,
  );
  // 中文注释：Authorization 需包含 Credential、SignedHeaders、Signature。
  const authorization = [
    "HMAC-SHA256",
    `Credential=${input.accessKeyId}/${credentialScope},`,
    `SignedHeaders=${SIGNED_HEADERS},`,
    `Signature=${signature}`,
  ].join(" ");
  return {
    Host: input.host,
    "X-Date": xDate,
    "X-Content-Sha256": payloadHash,
    "Content-Type": VOLCENGINE_CONTENT_TYPE,
    Authorization: authorization,
  };
}

/** Build canonical query string with RFC3986 encoding. */
function buildQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key] ?? "")}`)
    .join("&");
}

/** Encode value with RFC3986 rules. */
function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Format time as yyyyMMddTHHmmssZ. */
function formatXDate(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  const hh = date.getUTCHours().toString().padStart(2, "0");
  const mi = date.getUTCMinutes().toString().padStart(2, "0");
  const ss = date.getUTCSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/** Hash data with SHA-256 and return hex string. */
function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** HMAC-SHA256 with hex output. */
function hmacSha256Hex(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

/** Derive signing key for Volcengine V4 signing. */
function getSigningKey(secret: string, date: string): Buffer {
  const kDate = hmacSha256(Buffer.from(secret, "utf8"), date);
  const kRegion = hmacSha256(kDate, VOLCENGINE_REGION);
  const kService = hmacSha256(kRegion, VOLCENGINE_SERVICE);
  // 中文注释：签名密钥固定以 request 作为最后一步。
  return hmacSha256(kService, "request");
}

/** HMAC-SHA256 with binary output. */
function hmacSha256(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
