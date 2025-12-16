import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { SystemToolResult } from "./types";
import { stripHtmlToText, fetchTextWithLimits, isProbablyPrivateHostname } from "./utils";

/**
 * 抓取网页内容（只读）
 * - 用途：为 agent 提供“只读网页内容获取”能力（常用于查文档/文章）。
 * - 安全：MVP 只支持 GET，限制超时/大小，并默认阻止 localhost/私网地址（SSRF 保护的最小版本）。
 */
export const webFetchTool = tool({
  description: "通过 HTTP GET 请求抓取指定网页的内容并返回文本格式。适用于需要获取网页内容（如文档、文章、新闻等）的场景。默认禁止访问 localhost 和私有网络地址以防止安全风险，有超时和最大字节数限制。",
  inputSchema: zodSchema(
    z.object({
      url: z.string().describe("目标网页 URL（仅支持 http/https）。"),
    }),
  ),
  execute: async (input): Promise<
    SystemToolResult<{
      url: string;
      status: number;
      contentType?: string;
      text: string;
    }>
  > => {
    let parsed: URL;
    try {
      parsed = new URL(input.url);
    } catch {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "url 不是合法的 URL。",
          riskType: "read",
        },
      };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "仅支持 http/https 协议。",
          riskType: "read",
        },
      };
    }

    if (isProbablyPrivateHostname(parsed.hostname)) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "出于安全考虑（SSRF），MVP 默认禁止访问 localhost/私网地址。",
          riskType: "read",
        },
      };
    }

    try {
      const { status, contentType, text } = await fetchTextWithLimits({
        url: parsed.toString(),
        userAgent: "teatime-ai/1.0 (system tool web_fetch)",
      });

      const shouldStrip = true;
      const finalText =
        shouldStrip && contentType?.includes("text/html")
          ? stripHtmlToText(text)
          : text.trim();

      return {
        ok: true,
        data: {
          url: parsed.toString(),
          status,
          contentType,
          text: finalText,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "EXECUTION_FAILED",
          message:
            err instanceof Error ? err.message : "抓取失败（未知错误）。",
          riskType: "read",
        },
      };
    }
  },
});
