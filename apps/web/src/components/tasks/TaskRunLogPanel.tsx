'use client'

import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tenas-ai/ui/sheet'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'

type TaskRunLogPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  workspaceId: string
  projectId?: string
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const TaskRunLogPanel = memo(function TaskRunLogPanel({
  open,
  onOpenChange,
  taskId,
  workspaceId,
  projectId,
}: TaskRunLogPanelProps) {
  const logsQuery = useQuery({
    ...trpc.scheduledTask.runLogs.queryOptions(
      { taskId, workspaceId, projectId, limit: 50 },
    ),
    enabled: open && Boolean(taskId),
  })
  const logs = logsQuery.data ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[440px] p-0">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="text-base font-semibold">执行日志</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-100px)] px-5 pb-5">
          {logsQuery.isLoading ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Clock className="h-8 w-8 text-muted-foreground/30 animate-pulse" />
              <span className="text-xs text-muted-foreground">加载中...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <Clock className="h-8 w-8 text-muted-foreground/20" />
              <span className="text-xs text-muted-foreground">暂无执行记录</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {logs.map((log, idx) => {
                const isOk = log.status === 'ok'
                const isLast = idx === logs.length - 1
                return (
                  <div key={log.id} className="flex gap-3">
                    {/* 时间线 */}
                    <div className="flex flex-col items-center">
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        isOk
                          ? 'bg-emerald-50 dark:bg-emerald-950/40'
                          : 'bg-rose-50 dark:bg-rose-950/40'
                      }`}>
                        {isOk
                          ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          : <XCircle className="h-3 w-3 text-rose-500" />
                        }
                      </div>
                      {!isLast ? <div className="w-px flex-1 bg-border/40 my-1" /> : null}
                    </div>
                    {/* 内容 */}
                    <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isOk ? '成功' : '失败'}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          {formatDuration(log.durationMs)}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(log.startedAt).toLocaleString()}
                      </div>
                      {log.error ? (
                        <div className="mt-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-2.5 py-1.5 text-[11px] text-rose-600 dark:text-rose-400 break-all">
                          {log.error}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
})
