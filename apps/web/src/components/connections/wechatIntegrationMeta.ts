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
 * Synthetic IntegrationDefinition for WeChat. WeChat is NOT an MCP-backed
 * integration — it's a first-class OpenLoaf module with its own account store
 * and dedicated binding dialog. We reuse the integration card shape so the
 * sidebar displays it alongside Notion et al., but the install/uninstall path
 * is overridden in ConnectionsMarketPage.
 */

import type { IntegrationDefinition } from '@openloaf/api/types/integrations'

export const WECHAT_INTEGRATION_ID = 'wechat'

export function buildWeChatIntegrationDefinition(
  installed: boolean,
): IntegrationDefinition {
  return {
    id: WECHAT_INTEGRATION_ID,
    name: 'WeChat',
    description:
      'Bind one or more WeChat accounts via iLink Bot API. Scan the QR code with the WeChat account you want to connect.',
    category: 'communication',
    iconUrl: '/icons/wechat.svg',
    homepage: 'https://www.wechatbot.dev',
    guide: [],
    credentials: [],
    installed,
  }
}
