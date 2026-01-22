import { memo, useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SchedulerTaskRecord = {
  /** Record id. */
  id: string;
  /** Project id. */
  projectId: string;
  /** Workspace id. */
  workspaceId?: string | null;
  /** Task type. */
  type: string;
  /** Target dates. */
  dates?: string[] | null;
  /** Related payload. */
  payload?: Record<string, unknown> | null;
  /** Status string. */
  status: string;
  /** Trigger source. */
  triggeredBy: string;
  /** Error message. */
  error?: string | null;
  /** Created time. */
  createdAt: string | Date;
  /** Updated time. */
  updatedAt: string | Date;
};

type SchedulerTaskHistoryPanelProps = {
  /** History records to render. */
  records?: SchedulerTaskRecord[];
  /** Loading flag. */
  isLoading?: boolean;
  /** Empty text. */
  emptyText?: string;
};

/** Render scheduler task history list. */
export const SchedulerTaskHistoryPanel = memo(function SchedulerTaskHistoryPanel({
  records,
  isLoading,
  emptyText,
}: SchedulerTaskHistoryPanelProps) {
  const items = useMemo(() => records ?? [], [records]);

  if (isLoading) {
    return (
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>触发</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
              加载中...
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (!items.length) {
    return (
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead>触发</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>错误</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
              {emptyText ?? "暂无记录"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead>日期</TableHead>
          <TableHead>触发</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>类型</TableHead>
          <TableHead>时间</TableHead>
          <TableHead>错误</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{renderDateLabel(item)}</TableCell>
            <TableCell className="text-muted-foreground">
              {renderTriggerLabel(item.triggeredBy)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {renderStatusLabel(item.status)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {item.type ? renderTypeLabel(item.type) : "-"}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatTime(item.createdAt)}</TableCell>
            <TableCell className={item.error ? "text-rose-500" : "text-muted-foreground"}>
              {item.error ?? "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

/** Render date label for a record. */
function renderDateLabel(record: SchedulerTaskRecord): string {
  const dates = Array.isArray(record.dates) ? record.dates.filter(Boolean) : [];
  if (dates.length === 1) return `单日 ${dates[0]}`;
  if (dates.length > 1) return `区间 ${dates[0]} ~ ${dates[dates.length - 1]}`;
  return "未标注日期";
}

/** Render trigger label. */
function renderTriggerLabel(triggeredBy: string): string {
  switch (triggeredBy) {
    case "scheduler":
      return "定时触发";
    case "manual":
      return "手动触发";
    case "external":
      return "外部触发";
    default:
      return triggeredBy || "未知来源";
  }
}

/** Render status label. */
function renderStatusLabel(status: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "success":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return status || "未知状态";
  }
}

/** Render type label. */
function renderTypeLabel(type: string): string {
  if (type === "summary-day") return "日汇总";
  if (type === "summary-range") return "区间汇总";
  return type;
}

/** Format time string for display. */
function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}
