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
 * Integration Registry
 *
 * Each entry is a high-level wrapper around an MCP server. Users install an
 * integration via a friendly dialog and never see MCP internals. The registry
 * defines both the user-facing metadata and a `buildMcpConfig` function that
 * materialises an MCP server config from user-supplied credentials.
 */

import type { IntegrationDefinition } from '@openloaf/api/types/integrations'
import type { AddMCPServerInput } from '@openloaf/api/types/mcp'

export interface ServerIntegrationDefinition
  extends Omit<IntegrationDefinition, 'installed' | 'mcpServerId'> {
  /** Translate user-supplied credentials into an MCP server config. */
  buildMcpConfig: (credentials: Record<string, string>) => AddMCPServerInput
}

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------
const NOTION: ServerIntegrationDefinition = {
  id: 'notion',
  name: 'Notion',
  description:
    'Access your Notion pages, create and edit content, and manage your workspace from chat.',
  category: 'productivity',
  brandColor: '#000000',
  homepage: 'https://www.notion.so',
  guide: [
    {
      title: 'Create an internal integration in Notion',
      description:
        'Open Notion Integrations page and click "New integration". Name it "OpenLoaf" (or anything you like).',
      link: {
        href: 'https://www.notion.so/profile/integrations',
        label: 'Open Notion Integrations',
      },
    },
    {
      title: 'Copy the integration secret',
      description:
        'After creation, reveal and copy the Internal Integration Secret (starts with "ntn_" or "secret_").',
    },
    {
      title: 'Share pages with your integration',
      description:
        'Open each Notion page you want to expose, click "..." → "Connections" → select your integration.',
    },
  ],
  credentials: [
    {
      key: 'token',
      label: 'Notion Integration Token',
      type: 'password',
      placeholder: 'ntn_...',
      helpText: 'Your internal integration secret from notion.so/profile/integrations',
      required: true,
    },
  ],
  buildMcpConfig: (credentials) => ({
    name: 'Notion',
    description: 'Notion workspace (managed by OpenLoaf Connections)',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${credentials.token ?? ''}`,
        'Notion-Version': '2022-06-28',
      }),
    },
    enabled: true,
    scope: 'global',
  }),
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const INTEGRATION_REGISTRY: ServerIntegrationDefinition[] = [NOTION]

export function findIntegration(id: string): ServerIntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((entry) => entry.id === id)
}
