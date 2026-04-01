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
  name: "获取网页内容",
  description: `Fetches a web page and returns its content as markdown.

Usage:
- Provide a URL and a prompt describing what information you need from the page
- HTML pages are automatically converted to markdown for easy reading
- JSON responses are pretty-printed
- Content is truncated to 100,000 characters if too long
- HTTP to HTTPS upgrade is automatic
- Redirects within the same host are followed automatically (up to 10)
- Cross-host redirects are reported back so you can fetch the new URL

IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs. Before using this tool, check if the URL points to an authenticated service (e.g. Google Docs, Confluence, Jira, GitHub). If so, look for a specialized MCP tool or browser automation that provides authenticated access.`,
  parameters: z.object({
    url: z
      .string()
      .min(1)
      .describe("The URL to fetch content from"),
    prompt: z
      .string()
      .min(1)
      .describe("A prompt describing what information you need from this page. This helps focus the extraction."),
  }),
  component: null,
} as const;
