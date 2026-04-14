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
// Official Notion brand glyph (source: simple-icons / notion.svg).
// Rendered inside <svg viewBox="0 0 24 24"> with currentColor fill.
const NOTION_ICON_PATH =
  'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z'

const NOTION: ServerIntegrationDefinition = {
  id: 'notion',
  name: 'Notion',
  description:
    'Access your Notion pages, create and edit content, and manage your workspace from chat.',
  category: 'productivity',
  brandColor: '#000000',
  iconSvgPath: NOTION_ICON_PATH,
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
