/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openloaf/ui/table";

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

type TFunc = (key: string, options?: Record<string, unknown>) => string;

/** Render date label for a record. */
function renderDateLabel(record: SchedulerTaskRecord, t: TFunc): string {
  const dates = Array.isArray(record.dates) ? record.dates.filter(Boolean) : [];
  if (dates.length === 1) return t('history.singleDay', { date: dates[0] });
  if (dates.length > 1) return t('history.dateRange', { start: dates[0], end: dates[dates.length - 1] });
  return t('history.noDate');
}

/** Render trigger label. */
function renderTriggerLabel(triggeredBy: string, t: TFunc): string {
  switch (triggeredBy) {
    case "scheduler":
      return t('history.triggerScheduler');
    case "manual":
      return t('history.triggerManual');
    case "external":
      return t('history.triggerExternal');
    default:
      return triggeredBy || t('history.triggerUnknown');
  }
}

/** Render status label. */
function renderStatusLabel(status: string, t: TFunc): string {
  switch (status) {
    case "running":
      return t('history.statusRunning');
    case "success":
      return t('history.statusSuccess');
    case "failed":
      return t('history.statusFailed');
    default:
      return status || t('history.statusUnknown');
  }
}

/** Render type label. */
function renderTypeLabel(type: string, t: TFunc): string {
  if (type === "summary-day") return t('history.typeDay');
  if (type === "summary-range") return t('history.typeRange');
  return type;
}

/** Format time string for display. */
function formatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

/** Render scheduler task history list. */
export const SchedulerTaskHistoryPanel = memo(function SchedulerTaskHistoryPanel({
  records,
  isLoading,
  emptyText,
}: SchedulerTaskHistoryPanelProps) {
  const { t } = useTranslation('tasks');
  const items = useMemo(() => records ?? [], [records]);

  const tableHeader = (
    <TableHeader className="bg-muted/50">
      <TableRow>
        <TableHead>{t('history.colDate')}</TableHead>
        <TableHead>{t('history.colTrigger')}</TableHead>
        <TableHead>{t('history.colStatus')}</TableHead>
        <TableHead>{t('history.colType')}</TableHead>
        <TableHead>{t('history.colTime')}</TableHead>
        <TableHead>{t('history.colError')}</TableHead>
      </TableRow>
    </TableHeader>
  );

  if (isLoading) {
    return (
      <Table>
        {tableHeader}
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
              {t('history.loading')}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  if (!items.length) {
    return (
      <Table>
        {tableHeader}
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
              {emptyText ?? t('history.noRecords')}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      {tableHeader}
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{renderDateLabel(item, t)}</TableCell>
            <TableCell className="text-muted-foreground">
              {renderTriggerLabel(item.triggeredBy, t)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {renderStatusLabel(item.status, t)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {item.type ? renderTypeLabel(item.type, t) : "-"}
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
