import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SystemToolResult } from "./types";
import { fetchTextWithLimits } from "./utils";

/**
 * 搜索（只读）
 * - 用途：让 agent 有“最小搜索能力”（找资料/关键词定位）。
 * - 设计：MVP 采用“可配置 provider”，不内置爬虫式搜索；未配置时返回 NOT_CONFIGURED。
 */
export const webSearchTool = tool({
  description:
    "【system/read】网络搜索并返回结果列表。MVP：需要配置 SEARCH_API_URL（返回 JSON）；超时为代码内固定值。",
  inputSchema: zodSchema(
    z.object({
      query: z.string().describe("搜索关键词"),
      limit: z.number().int().min(1).max(20).optional().describe("返回条数上限"),
    }),
  ),
  execute: async (input): Promise<
    SystemToolResult<{
      query: string;
      results: Array<{ title: string; url: string; snippet?: string }>;
    }>
  > => {
    const apiUrl = process.env.SEARCH_API_URL;
    if (!apiUrl) {
      return {
        ok: false,
        error: {
          code: "NOT_CONFIGURED",
          message:
            "未配置 SEARCH_API_URL（MVP 搜索 provider）。请先配置一个返回 JSON 的搜索服务。",
          riskType: "read",
        },
      };
    }

    // MVP 约定：SEARCH_API_URL 接收 query/limit，返回：
    // { results: [{ title, url, snippet? }, ...] }
    try {
      const url = new URL(apiUrl);
      url.searchParams.set("query", input.query);
      url.searchParams.set("limit", String(input.limit ?? 10));

      const { status, contentType, text } = await fetchTextWithLimits({
        url: url.toString(),
      });

      if (status < 200 || status >= 300) {
        return {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: `搜索服务返回非 2xx：${status}`,
            riskType: "read",
          },
        };
      }

      if (contentType && !contentType.includes("application/json")) {
        return {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: "搜索服务未返回 JSON（content-type 非 application/json）。",
            riskType: "read",
          },
        };
      }

      const parsed = JSON.parse(text) as {
        results?: Array<{ title: string; url: string; snippet?: string }>;
      };

      const results = Array.isArray(parsed.results) ? parsed.results : [];

      return {
        ok: true,
        data: {
          query: input.query,
          results: results.slice(0, input.limit ?? 10),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "搜索失败（未知错误）。",
          riskType: "read",
        },
      };
    }
  },
});
