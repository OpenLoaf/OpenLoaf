/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * WeChat Router (iLink Bot)
 *
 * Manages WeChat account bindings via QR-code login. Unlike MCP-backed
 * integrations (Notion), WeChat is a first-class OpenLoaf module with its
 * own account store and short-poll binding flow.
 */

import { z } from 'zod'
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const weChatAccountStatusSchema = z.enum(['connected', 'expired', 'disconnected'])
export type WeChatAccountStatusDto = z.infer<typeof weChatAccountStatusSchema>

export const weChatAccountSchema = z.object({
  id: z.string(),
  botId: z.string(),
  displayName: z.string(),
  status: weChatAccountStatusSchema,
  boundAt: z.string(),
  lastActiveAt: z.string().optional(),
})
export type WeChatAccountDto = z.infer<typeof weChatAccountSchema>

export const weChatBindStatusSchema = z.enum(['wait', 'scaned', 'confirmed', 'expired'])
export type WeChatBindStatusDto = z.infer<typeof weChatBindStatusSchema>

export const wechatSchemas = {
  listAccounts: {
    output: z.array(weChatAccountSchema),
  },
  startBind: {
    output: z.object({
      sessionId: z.string(),
      qrcodeDataUrl: z.string(),
      expiresAt: z.number(),
    }),
  },
  pollBindStatus: {
    input: z.object({ sessionId: z.string() }),
    output: z.object({
      status: weChatBindStatusSchema,
      account: weChatAccountSchema.optional(),
    }),
  },
  cancelBind: {
    input: z.object({ sessionId: z.string() }),
    output: z.object({ ok: z.boolean() }),
  },
  unbindAccount: {
    input: z.object({ accountId: z.string() }),
    output: z.object({ ok: z.boolean() }),
  },
}

// ---------------------------------------------------------------------------
// Base Router (abstract, implemented in server)
// ---------------------------------------------------------------------------

export abstract class BaseWeChatRouter {
  public static routeName = 'wechat'

  public static createRouter() {
    return t.router({
      listAccounts: shieldedProcedure
        .output(wechatSchemas.listAccounts.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),

      startBind: shieldedProcedure
        .output(wechatSchemas.startBind.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      pollBindStatus: shieldedProcedure
        .input(wechatSchemas.pollBindStatus.input)
        .output(wechatSchemas.pollBindStatus.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),

      cancelBind: shieldedProcedure
        .input(wechatSchemas.cancelBind.input)
        .output(wechatSchemas.cancelBind.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      unbindAccount: shieldedProcedure
        .input(wechatSchemas.unbindAccount.input)
        .output(wechatSchemas.unbindAccount.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
    })
  }
}

export const wechatRouter = BaseWeChatRouter.createRouter()
export type WeChatRouter = typeof wechatRouter
