/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { ClientPlatform } from '@openloaf/api/types/platform'

/**
 * Per-platform excluded tool IDs.
 *
 * - desktop: full capability baseline — nothing excluded.
 * - web: excludes Electron-only tools + browser automation.
 * - cli: excludes UI rendering + frontend interaction + browser automation.
 */
const PLATFORM_EXCLUDED_TOOLS: Record<ClientPlatform, ReadonlySet<string>> = {
  desktop: new Set(),
  web: new Set([
    'OpenUrl',
    'BrowserSnapshot',
    'BrowserObserve',
    'BrowserExtract',
    'BrowserAct',
    'BrowserWait',
    'BrowserScreenshot',
    'BrowserDownloadImage',
  ]),
  cli: new Set([
    // UI rendering
    'JsxCreate',
    'ChartRender',
    'GenerateWidget',
    'WidgetInit',
    'WidgetList',
    'WidgetGet',
    'WidgetCheck',
    // Frontend interaction
    'AskUserQuestion',
    'OpenUrl',
    'EditDocument',
    // Browser automation
    'BrowserSnapshot',
    'BrowserObserve',
    'BrowserExtract',
    'BrowserAct',
    'BrowserWait',
    'BrowserScreenshot',
    'BrowserDownloadImage',
  ]),
}

/**
 * Filter tool IDs by client platform.
 *
 * When `platform` is undefined or `'desktop'`, all tools are returned (backward compatible).
 */
export function filterToolIdsByPlatform(
  toolIds: readonly string[],
  platform: ClientPlatform | undefined,
): string[] {
  if (!platform || platform === 'desktop') return [...toolIds]
  const excluded = PLATFORM_EXCLUDED_TOOLS[platform]
  if (!excluded?.size) return [...toolIds]
  return toolIds.filter((id) => !excluded.has(id))
}
