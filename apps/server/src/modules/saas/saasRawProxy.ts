/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Hono } from "hono";
import { proxy } from "hono/proxy";
import { ensureServerAccessToken } from "@/modules/auth/tokenStore";
import { getSaasBaseUrl } from "@/modules/saas/core/config";
import { logger } from "@/common/logger";

// ============================================================
// SaaS 反向代理白名单（与 SDK endpoints.ts 对齐）
//
// 规则：
// 1. 只允许纯透传的接口（无业务加工、无本地副作用）。
// 2. 新增 SaaS SDK 端点时必须在这里手动加一行 + 注释。
// 3. 带业务加工的接口（v3/generate、v3/task/:id、v3/upload、
//    v3/queue、auxiliary 等）不在此列，走 Server 自己的业务路由。
// 4. OAuth（/api/auth/*）完全不代理，由 Server 的 /auth/exchange
//    /auth/refresh /auth/logout 封装。
// ============================================================

const RAW_PROXY_GET_PATHS: ReadonlySet<string> = new Set([
  // 用户
  "/api/user/self",

  // 公共 AI 资源
  "/api/public/ai/chat/models",
  "/api/public/ai/models/updated-at",
  "/api/public/ai/providers",

  // v3 能力清单（按类别）
  "/api/ai/v3/capabilities/image",
  "/api/ai/v3/capabilities/video",
  "/api/ai/v3/capabilities/audio",
  "/api/ai/v3/capabilities/text",
  "/api/ai/v3/capabilities/chat",
  "/api/ai/v3/capabilities/tools",

  // 技能市场
  "/api/skill-market",

  // tRPC 成员查询（Web 直接 fetch）
  "/api/trpc/memberSubscription.current",
  "/api/trpc/memberCredits.transactions",
]);

const RAW_PROXY_POST_PATHS: ReadonlySet<string> = new Set([
  // 兑换码
  "/api/redeem-code/redeem",
  "/api/redeem-code/records",

  // 技能市场批量更新检查
  "/api/skill-market/check-updates",

  // v3 价格估算
  "/api/ai/v3/estimate-price",

  // v3 文本生成（流式 SSE）
  "/api/ai/v3/text/generate",
  "/api/ai/v3/text/chat",

  // 反馈
  "/api/public/feedback",
  "/api/feedback/upload",
]);

// 流式响应白名单（代理时需禁用上游压缩以避免缓冲）
const RAW_PROXY_STREAMING_STATIC_PATHS: ReadonlySet<string> = new Set([
  "/api/ai/v3/text/generate",
  "/api/ai/v3/text/chat",
]);

// ---------------- 动态段路径匹配 ----------------

// /api/ai/v3/task/:taskId/events         — SSE
const TASK_EVENTS_RE = /^\/api\/ai\/v3\/task\/([^/]+)\/events$/;
// /api/ai/v3/task/:taskId/cancel         — POST
const TASK_CANCEL_RE = /^\/api\/ai\/v3\/task\/([^/]+)\/cancel$/;
// /api/ai/v3/task-group/:groupId         — GET
const TASK_GROUP_RE = /^\/api\/ai\/v3\/task-group\/([^/]+)$/;
// /api/ai/v3/capabilities/detail/:variantId — GET
const CAPABILITIES_DETAIL_RE = /^\/api\/ai\/v3\/capabilities\/detail\/([^/]+)$/;

// 技能市场动态段（排除与静态路径冲突的 segment）
const SKILL_MARKET_RESERVED: ReadonlySet<string> = new Set([
  "check-updates",
]);
// /api/skill-market/:skillId              — GET detail
const SKILL_MARKET_DETAIL_RE = /^\/api\/skill-market\/([^/]+)$/;
// /api/skill-market/:skillId/download     — POST binary ZIP
const SKILL_MARKET_DOWNLOAD_RE = /^\/api\/skill-market\/([^/]+)\/download$/;
// /api/skill-market/:skillId/rate         — POST
const SKILL_MARKET_RATE_RE = /^\/api\/skill-market\/([^/]+)\/rate$/;

function isReservedSkillSegment(match: RegExpMatchArray | null): boolean {
  if (!match) return false;
  const segment = match[1];
  return segment ? SKILL_MARKET_RESERVED.has(segment) : true;
}

function matchDynamicGet(path: string): boolean {
  if (TASK_EVENTS_RE.test(path)) return true;
  if (TASK_GROUP_RE.test(path)) return true;
  if (CAPABILITIES_DETAIL_RE.test(path)) return true;
  const detail = path.match(SKILL_MARKET_DETAIL_RE);
  if (detail && !isReservedSkillSegment(detail)) return true;
  return false;
}

function matchDynamicPost(path: string): boolean {
  if (TASK_CANCEL_RE.test(path)) return true;
  const rate = path.match(SKILL_MARKET_RATE_RE);
  if (rate && !isReservedSkillSegment(rate)) return true;
  const download = path.match(SKILL_MARKET_DOWNLOAD_RE);
  if (download && !isReservedSkillSegment(download)) return true;
  return false;
}

function isStreamingPath(path: string): boolean {
  if (RAW_PROXY_STREAMING_STATIC_PATHS.has(path)) return true;
  if (TASK_EVENTS_RE.test(path)) return true;
  return false;
}

/**
 * Task events SSE 上游约定为匿名访问（SDK 注释：taskId 不可猜测保证安全）。
 * 反代若注入 Authorization 会把匿名请求升级为认证请求，可能导致 SaaS 侧
 * 额外的所有权校验反而打断正常轮询。显式不注入。
 */
function isAnonymousStreamPath(path: string): boolean {
  return TASK_EVENTS_RE.test(path);
}

/** Header allowlist — only these are forwarded upstream. */
const FORWARDED_HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  "content-type",
  "accept",
  "accept-language",
]);

/**
 * Reject any path that contains encoded path separators or traversal
 * sequences that could slip past the allowlist regex match.
 */
function containsEncodedPathTricks(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes("%2f")) return true; // encoded /
  if (lower.includes("%5c")) return true; // encoded \
  if (lower.includes("%2e%2e")) return true; // encoded ..
  if (path.includes("\\")) return true;
  if (path.includes("..")) return true;
  return false;
}

function isAllowed(method: string, path: string): boolean {
  if (method === "GET") {
    return RAW_PROXY_GET_PATHS.has(path) || matchDynamicGet(path);
  }
  if (method === "POST") {
    return RAW_PROXY_POST_PATHS.has(path) || matchDynamicPost(path);
  }
  return false;
}

const MOUNT_PREFIX = "/api/saas/raw";

type ErrorPayload = {
  /** Marks response as failure. */
  success: false;
  /** Stable error code. */
  code: string;
  /** Human readable message. */
  message: string;
};

function errorPayload(code: string, message: string): ErrorPayload {
  return { success: false, code, message };
}

/** Register the SaaS raw reverse proxy routes. */
export function registerSaasRawProxyRoutes(app: Hono): void {
  app.all(`${MOUNT_PREFIX}/*`, async (c) => {
    const upstreamPath = c.req.path.slice(MOUNT_PREFIX.length);
    const method = c.req.method;

    // 路径安全断言：禁止编码斜杠/反斜杠/父目录跳转绕过 allowlist。
    if (containsEncodedPathTricks(upstreamPath)) {
      return c.json(
        errorPayload("saas_raw_path_invalid", "路径包含非法字符"),
        400,
      );
    }

    if (!isAllowed(method, upstreamPath)) {
      return c.json(
        errorPayload("saas_raw_path_forbidden", "路径未加入 SaaS 反代白名单"),
        403,
      );
    }

    let baseUrl: string;
    try {
      baseUrl = getSaasBaseUrl();
    } catch {
      return c.json(errorPayload("saas_base_url_missing", "SaaS 服务地址未配置"), 500);
    }

    const anonymous = isAnonymousStreamPath(upstreamPath);
    const token = anonymous ? "" : (await ensureServerAccessToken()) ?? "";
    if (!anonymous && !token) {
      return c.json(errorPayload("saas_auth_required", "请先登录云端账号"), 401);
    }

    const incomingUrl = new URL(c.req.url);
    const targetUrl = `${baseUrl}${upstreamPath}${incomingUrl.search}`;

    // 逻辑：header 白名单 —— 只放 Content-Type / Accept / Accept-Language。
    // 其余全部丢弃，避免 Origin / Referer / X-Forwarded-* / Cookie 等本地信息
    // 或伪造 header 泄漏到 SaaS。
    const forwardedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(c.req.header())) {
      if (FORWARDED_HEADER_ALLOWLIST.has(key.toLowerCase())) {
        forwardedHeaders[key] = value;
      }
    }
    if (!anonymous) {
      forwardedHeaders.Authorization = `Bearer ${token}`;
    }
    if (isStreamingPath(upstreamPath)) {
      // 逻辑：流式响应需要原样读取事件，不能让中间层做 gzip 缓冲。
      forwardedHeaders["accept-encoding"] = "identity";
    }

    try {
      return await proxy(targetUrl, {
        method,
        headers: forwardedHeaders,
        body: method === "GET" || method === "HEAD" ? undefined : c.req.raw.body,
      });
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          path: upstreamPath,
          method,
        },
        "[saasRawProxy] upstream request failed",
      );
      return c.json(errorPayload("saas_raw_upstream_failed", "SaaS 上游请求失败"), 502);
    }
  });
}
