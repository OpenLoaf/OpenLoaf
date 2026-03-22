/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import dns from "node:dns";
import { SaaSClient } from "@openloaf-saas/sdk";
import { logger } from "../../common/logger";
import { getSaasBaseUrl } from "./core/config";

/** Connect timeout for SaaS requests (ms). */
const SAAS_TIMEOUT_MS = 30_000;

/** Resolve DNS for a hostname and log the results for diagnostics. */
function diagnoseDns(hostname: string): void {
  const t0 = Date.now();
  dns.resolve4(hostname, (err4, ipv4) => {
    const ms4 = Date.now() - t0;
    if (err4) {
      logger.warn({ hostname, err: err4.message, ms: ms4 }, "[saas-diag] DNS A lookup failed");
    } else {
      logger.info({ hostname, ipv4, ms: ms4 }, "[saas-diag] DNS A lookup ok");
    }
  });
  dns.resolve6(hostname, (err6, ipv6) => {
    const ms6 = Date.now() - t0;
    if (err6) {
      logger.info({ hostname, err: err6.message, ms: ms6 }, "[saas-diag] DNS AAAA lookup (no IPv6, ok)");
    } else {
      logger.info({ hostname, ipv6, ms: ms6 }, "[saas-diag] DNS AAAA lookup ok");
    }
  });
}

const isDev = process.env.NODE_ENV !== "production";

/** Safely extract request body for logging (truncate large payloads). */
function extractBody(init?: RequestInit): unknown {
  if (!init?.body) return undefined;
  if (typeof init.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      return parsed;
    } catch {
      return init.body.length > 500 ? `${init.body.slice(0, 500)}…` : init.body;
    }
  }
  return "[non-string body]";
}

/** Fetch wrapper with configurable timeout and diagnostics logging. */
const timeoutFetcher: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  const method = init?.method ?? "GET";
  const t0 = Date.now();

  if (isDev) {
    const body = extractBody(init);
    const headers = init?.headers
      ? Object.fromEntries(
          init.headers instanceof Headers
            ? (init.headers as unknown as { entries(): Iterable<[string, string]> }).entries()
            : Array.isArray(init.headers)
              ? init.headers
              : Object.entries(init.headers),
        )
      : undefined;
    logger.debug({ method, url, headers, body }, "[saas-fetch] >>> request");
  } else {
    logger.info({ url }, "[saas-fetch] start");
  }

  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(SAAS_TIMEOUT_MS),
  }).then(
    async (res) => {
      const ms = Date.now() - t0;
      if (isDev) {
        // 克隆响应以读取 body，不影响下游消费
        const cloned = res.clone();
        let resBody: unknown;
        try {
          resBody = await cloned.json();
        } catch {
          try {
            const text = await cloned.text();
            resBody = text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
          } catch {
            resBody = "[unreadable]";
          }
        }
        logger.debug(
          { method, url, status: res.status, ms, resBody },
          "[saas-fetch] <<< response",
        );
      } else {
        logger.info({ url, status: res.status, ms }, "[saas-fetch] ok");
      }
      return res;
    },
    (err) => {
      const ms = Date.now() - t0;
      const code = (err as { cause?: { code?: string } })?.cause?.code;
      logger.error(
        { url, ms, code, err: err instanceof Error ? err.message : String(err) },
        "[saas-fetch] failed",
      );
      // 连接超时时做一次 DNS 诊断
      if (code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
        try {
          const hostname = new URL(url).hostname;
          diagnoseDns(hostname);
        } catch { /* ignore parse errors */ }
      }
      throw err;
    },
  );
};

/** Cache SaaS client instance by base URL. */
let cached: { baseUrl: string; client: SaaSClient } | null = null;

/** Get SaaS SDK client with optional access token. */
export function getSaasClient(accessToken?: string): SaaSClient {
  const baseUrl = getSaasBaseUrl();
  if (accessToken) {
    // 逻辑：按请求传入 token 时不复用缓存，避免跨用户共享。
    return new SaaSClient({
      baseUrl,
      getAccessToken: () => accessToken,
      fetcher: timeoutFetcher,
    });
  }
  if (cached?.baseUrl === baseUrl) {
    return cached.client;
  }
  // 逻辑：baseUrl 变化时才重建 client，避免重复创建。
  const client = new SaaSClient({ baseUrl, fetcher: timeoutFetcher });
  cached = { baseUrl, client };
  return client;
}
