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
 * WeChat Router Implementation
 *
 * Thin adapter that binds the tRPC endpoints defined in
 * packages/api/src/routers/wechat.ts to the wechatService orchestration layer.
 */

import { BaseWeChatRouter, wechatSchemas, t, shieldedProcedure } from '@openloaf/api'
import {
  listAccounts,
  startBind,
  pollBindStatus,
  cancelBind,
  unbindAccount,
} from '@/services/wechat/wechatService'
import { logger } from '@/common/logger'

class WeChatRouterImpl extends BaseWeChatRouter {
  public static override createRouter() {
    return t.router({
      listAccounts: shieldedProcedure
        .output(wechatSchemas.listAccounts.output)
        .query(async () => {
          return listAccounts()
        }),

      startBind: shieldedProcedure
        .output(wechatSchemas.startBind.output)
        .mutation(async () => {
          try {
            return await startBind()
          } catch (err) {
            logger.error({ err: String(err) }, '[wechat] startBind failed')
            throw new Error(
              `Failed to obtain WeChat QR code: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }),

      pollBindStatus: shieldedProcedure
        .input(wechatSchemas.pollBindStatus.input)
        .output(wechatSchemas.pollBindStatus.output)
        .query(async ({ input }) => {
          return pollBindStatus(input.sessionId)
        }),

      cancelBind: shieldedProcedure
        .input(wechatSchemas.cancelBind.input)
        .output(wechatSchemas.cancelBind.output)
        .mutation(async ({ input }) => {
          return cancelBind(input.sessionId)
        }),

      unbindAccount: shieldedProcedure
        .input(wechatSchemas.unbindAccount.input)
        .output(wechatSchemas.unbindAccount.output)
        .mutation(async ({ input }) => {
          return unbindAccount(input.accountId)
        }),
    })
  }
}

export const wechatRouterImplementation = WeChatRouterImpl.createRouter()
