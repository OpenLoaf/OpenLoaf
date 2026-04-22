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

// Official WeChat brand glyph from simple-icons (path 'd' attribute).
const WECHAT_ICON_PATH =
  'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.81-.05-.857-2.578.324-4.973 2.534-6.332 1.545-.95 3.536-1.303 5.51-.966-.64-3.194-3.888-5.334-7.844-5.334zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177-.005-.02-.123-.465-.324-1.234a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z'

export function buildWeChatIntegrationDefinition(
  installed: boolean,
): IntegrationDefinition {
  return {
    id: WECHAT_INTEGRATION_ID,
    name: 'WeChat',
    description:
      'Bind one or more WeChat accounts via iLink Bot API. Scan the QR code with the WeChat account you want to connect.',
    category: 'communication',
    brandColor: '#07C160',
    iconSvgPath: WECHAT_ICON_PATH,
    homepage: 'https://www.wechatbot.dev',
    guide: [],
    credentials: [],
    installed,
  }
}
