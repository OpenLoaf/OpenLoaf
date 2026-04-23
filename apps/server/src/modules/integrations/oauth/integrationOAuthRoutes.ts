/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { Hono } from 'hono'
import { logger } from '@/common/logger'
import { completeIntegrationOAuthInstall } from './integrationOAuthService'

/** Escape HTML special characters to prevent injection. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case "'":
        return '&#39;'
      default:
        return char
    }
  })
}

/** Render a lightweight OAuth callback success page. */
function renderSuccessPage(integrationId: string): string {
  const safeIntegrationId = escapeHtml(integrationId)
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>连接成功</title>
    <style>
      :root { color-scheme: dark; --bg: #101114; --card: #181a1f; --ink: #f5f2ea; --muted: #a7a091; --line: rgba(255,255,255,.08); }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; background: radial-gradient(circle at top left, rgba(255,255,255,.08), transparent 35%), var(--bg); }
      body { display: flex; align-items: center; justify-content: center; padding: 24px; color: var(--ink); font-family: "Avenir Next", "PingFang SC", sans-serif; }
      .card { width: min(460px, 100%); padding: 28px 26px; border-radius: 24px; background: var(--card); border: 1px solid var(--line); text-align: center; box-shadow: 0 18px 48px rgba(0,0,0,.35); }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0; color: var(--muted); line-height: 1.7; }
      .tag { display: inline-block; margin-top: 10px; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.06); color: var(--ink); font-size: 13px; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>连接成功</h1>
      <p>授权已经完成，你可以回到 OpenLoaf 继续使用。</p>
      <div class="tag">${safeIntegrationId}</div>
    </main>
    <script>
      setTimeout(() => window.close(), 1800);
    </script>
  </body>
</html>`
}

/** Render a lightweight OAuth callback error page. */
function renderErrorPage(message: string): string {
  const safeMessage = escapeHtml(message)
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>连接失败</title>
    <style>
      :root { color-scheme: dark; --bg: #101114; --card: #181a1f; --ink: #f5f2ea; --muted: #b1a99a; --err: #ff8f8f; --line: rgba(255,255,255,.08); }
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; background: var(--bg); }
      body { display: flex; align-items: center; justify-content: center; padding: 24px; color: var(--ink); font-family: "Avenir Next", "PingFang SC", sans-serif; }
      .card { width: min(460px, 100%); padding: 28px 26px; border-radius: 24px; background: var(--card); border: 1px solid var(--line); text-align: center; }
      h1 { margin: 0 0 10px; font-size: 24px; color: var(--err); }
      p { margin: 0; color: var(--muted); line-height: 1.7; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>连接失败</h1>
      <p>${safeMessage}</p>
    </main>
  </body>
</html>`
}

/** Register OAuth callback routes for MCP-backed integrations. */
export function registerIntegrationOAuthRoutes(app: Hono): void {
  app.get('/oauth/integrations/:integrationId/callback', async (c) => {
    const integrationId = c.req.param('integrationId')
    const error = c.req.query('error')
    const errorDescription = c.req.query('error_description')
    const code = c.req.query('code')
    const state = c.req.query('state')

    if (error) {
      const message = errorDescription ?? error
      logger.warn(
        { integrationId, error, errorDescription },
        '[integrations-oauth] callback received error',
      )
      return c.html(renderErrorPage(message), 400)
    }

    if (!code) {
      return c.html(renderErrorPage('缺少授权码参数。'), 400)
    }

    try {
      const serverOrigin = new URL(c.req.url).origin
      await completeIntegrationOAuthInstall(integrationId, code, state, serverOrigin)
      return c.html(renderSuccessPage(integrationId))
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      logger.error({ err, integrationId }, '[integrations-oauth] callback failed')
      return c.html(renderErrorPage(message), 500)
    }
  })
}
