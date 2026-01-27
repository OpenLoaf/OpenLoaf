import { tool, zodSchema } from "ai";
import { timeNowToolDef } from "@tenas-ai/api/types/tools/system";

/**
 * Resolve current server time info.
 */
export const timeNowTool = tool({
  description: timeNowToolDef.description,
  inputSchema: zodSchema(timeNowToolDef.parameters),
  execute: async ({ timezone }) => {
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
