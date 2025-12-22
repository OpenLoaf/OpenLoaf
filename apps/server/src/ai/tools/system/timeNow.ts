import { tool, zodSchema } from "ai";
import { timeNowToolDef } from "@teatime-ai/api/types/tools/system";

/**
 * Returns current server time info (MVP).
 */
export const timeNowTool = tool({
  description: timeNowToolDef.description,
  inputSchema: zodSchema(timeNowToolDef.parameters),
  execute: async ({ timezone }) => {
    // MVP 只做最小可用实现：返回 ISO、时间戳与解析到的时区（如传入无效时区则报错）。
    const now = new Date();
    const tz = timezone?.trim();

    let resolvedTimeZone: string | undefined;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", tz ? { timeZone: tz } : undefined);
      resolvedTimeZone = formatter.resolvedOptions().timeZone;
    } catch {
      throw new Error(`Invalid timezone: ${tz}`);
    }

    return {
      ok: true,
      data: {
        iso: now.toISOString(),
        unixMs: now.getTime(),
        timeZone: resolvedTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  },
});
