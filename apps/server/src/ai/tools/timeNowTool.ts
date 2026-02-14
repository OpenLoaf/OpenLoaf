import { tool, zodSchema } from 'ai'
import { timeNowToolDef } from '@tenas-ai/api/types/tools/system'

/**
 * Resolve current server time info.
 */
export const timeNowTool = tool({
  description: timeNowToolDef.description,
  inputSchema: zodSchema(timeNowToolDef.parameters),
  execute: async ({ timezone }) => {
    const now = new Date()
    const tz = timezone?.trim()

    let resolvedTimeZone: string
    try {
      const formatter = new Intl.DateTimeFormat('en-US', tz ? { timeZone: tz } : undefined)
      resolvedTimeZone =
        formatter.resolvedOptions().timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      throw new Error(`Invalid timezone: ${tz}`)
    }

    // 逻辑：用 Intl 在目标时区提取各日期部件，避免模型自行推算出错
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now)

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? ''

    const year = Number(get('year'))
    const month = Number(get('month'))
    const day = Number(get('day'))
    const hour = Number(get('hour'))
    const minute = Number(get('minute'))
    const second = Number(get('second'))

    // 逻辑：通过 Intl 获取目标时区的星期，而非服务器本地时区
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
      timeZone: resolvedTimeZone,
      weekday: 'long',
    }).format(now)

    const dayOfWeekZh = new Intl.DateTimeFormat('zh-CN', {
      timeZone: resolvedTimeZone,
      weekday: 'long',
    }).format(now)

    const localFormatted = new Intl.DateTimeFormat('zh-CN', {
      timeZone: resolvedTimeZone,
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(now)

    return {
      ok: true,
      data: {
        iso: now.toISOString(),
        unixMs: now.getTime(),
        timeZone: resolvedTimeZone,
        year,
        month,
        day,
        hour,
        minute,
        second,
        dayOfWeek,
        dayOfWeekZh,
        localFormatted,
      },
    }
  },
})
