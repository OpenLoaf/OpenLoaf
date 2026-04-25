/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { findIntegrationIdByMcpServerId } from '@/services/integrationService'
import { refreshIntegrationIdentity } from './integrationIdentityService'

let registered = false

/**
 * Wire up integration identity auto-refresh on every MCP server connect. Call
 * once at app startup. Idempotent — calling twice is a no-op.
 */
export function registerIntegrationIdentityListeners(): void {
  if (registered) return
  registered = true

  mcpClientManager.onServerConnected((serverId) => {
    const integrationId = findIntegrationIdByMcpServerId(serverId)
    if (!integrationId) return
    void refreshIntegrationIdentity(integrationId, serverId)
  })
}
