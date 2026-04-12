/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";

export const webFetchToolDef = {
  id: "WebFetch",
  readonly: true,
  name: "Fetch Url",
  description: `Fetch a web page. Returns a lossy markdown Summary plus the path to the raw saved body on disk (HTML / JSON / text written to \`\${CURRENT_CHAT_DIR}/webfetch/...\`).

- For readable content (articles, docs, markdown), use the Summary.
- For structural analysis (script tags, meta tags, SPA shells), Read or Grep the raw file — the Summary strips that info.
- HTTP upgrades to HTTPS automatically; same-host redirects are followed (up to 10).

Important: WebFetch fails on authenticated or private URLs (Google Docs, Confluence, Jira, GitHub private, etc.). For those, use a specialized MCP tool or browser automation.`,
  parameters: z.object({
    url: z.string().min(1),
    prompt: z
      .string()
      .min(1)
      .describe("What information you need from the page; helps focus extraction."),
  }),
  component: null,
} as const;
