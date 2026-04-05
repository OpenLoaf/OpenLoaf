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
  name: "获取网页内容",
  description: `Fetches a web page and returns both a lossy markdown Summary AND the path to the raw saved body.

Output structure:
- Header: URL, status, byte size, latency
- "Raw saved → \${CURRENT_CHAT_DIR}/webfetch/{timestamp}_{host}.{ext}" — the UNTRANSFORMED response body (HTML/JSON/text) written to disk
- "## Summary" — HTML converted to markdown (lossy: drops <script>/<link>/<meta>/attributes), truncated to 32KB
- "## Tip" — reminder to Read/Grep the Raw file when you need DOM structure

Usage:
- Provide a URL and a prompt describing what information you need
- For readable content (articles, docs, markdown), use the Summary
- For structural analysis (script tags, CSS links, meta tags, SPAs), Read or Grep the Raw file path directly — the Summary will have stripped that info out
- JSON responses are pretty-printed into Summary; raw JSON is also saved
- HTTP to HTTPS upgrade is automatic
- Same-host redirects followed automatically (up to 10); cross-host redirects are reported so you can re-fetch

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
