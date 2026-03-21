/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openloaf/ui/table";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { Switch } from "@openloaf/ui/switch";
import { Clock, Cloud, Minus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { truncateDisplay, type S3ProviderEntry } from "@/components/setting/menus/provider/use-provider-management";
import type { Dispatch, SetStateAction } from "react";

/** Flat-color icon badge for settings items. */
function SettingIcon({ icon: Icon, bg, fg }: { icon: LucideIcon; bg: string; fg: string }) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  );
}

type S3ProviderSectionProps = {
  /** S3 entries list. */
  entries: S3ProviderEntry[];
  /** Auto upload enabled. */
  autoUploadEnabled: boolean;
  /** Update auto upload enabled. */
  onAutoUploadChange: (enabled: boolean) => void;
  /** Auto delete hours. */
  autoDeleteHours: number;
  /** Update auto delete hours. */
  onAutoDeleteHoursChange: Dispatch<SetStateAction<number>>;
  /** Add entry callback. */
  onAdd: () => void;
  /** Edit entry callback. */
  onEdit: (entry: S3ProviderEntry) => void;
  /** Test entry callback. */
  onTest: (entry: S3ProviderEntry) => void;
  /** Activate entry callback. */
  onActivate: (entry: S3ProviderEntry) => void;
  /** Delete entry callback. */
  onDelete: (key: string) => void;
  /** Current active S3 id. */
  activeS3Id?: string;
  /** Current testing key. */
  testingKey?: string | null;
};

/**
 * Render S3 provider list.
 */
export function S3ProviderSection({
  entries,
  autoUploadEnabled,
  onAutoUploadChange,
  autoDeleteHours,
  onAutoDeleteHoursChange,
  onAdd,
  onEdit,
  onTest,
  onActivate,
  onDelete,
  activeS3Id,
  testingKey,
}: S3ProviderSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <>
      <OpenLoafSettingsGroup
        title={t("s3.groupTitle")}
        subtitle={t("s3.groupSubtitle")}
        className="pb-4"
      >
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Cloud} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("s3.autoUpload")}</div>
              <div className="text-xs text-muted-foreground">{t("s3.autoUploadDesc")}</div>
            </div>
            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end">
              <Switch checked={autoUploadEnabled} onCheckedChange={onAutoUploadChange} />
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Clock} bg="bg-secondary" fg="text-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t("s3.autoDelete")}</div>
              <div className="text-xs text-muted-foreground">{t("s3.autoDeleteDesc")}</div>
            </div>
            <OpenLoafSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onAutoDeleteHoursChange((prev) => Math.max(1, prev - 1))}
                aria-label="Decrease auto delete hours"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="min-w-[56px] text-center text-sm tabular-nums">
                {autoDeleteHours} {t("s3.hours")}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => onAutoDeleteHoursChange((prev) => Math.min(168, prev + 1))}
                aria-label="Increase auto delete hours"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup
        title={t("s3.providerListTitle")}
        subtitle={t("s3.providerListSubtitle")}
        showBorder={false}
        action={
          <Button variant="default" onClick={onAdd}>
            {t("s3.add")}
          </Button>
        }
      >
        <div className="rounded-3xl border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t("s3.colName")}</TableHead>
                <TableHead>{t("s3.colProvider")}</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">{t("s3.colActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isActive = Boolean(activeS3Id && entry.id === activeS3Id);
                return (
                  <TableRow key={entry.key}>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <span>{entry.key}</span>
                        {isActive ? (
                          <span className="px-1.5 py-0.5 rounded-3xl text-[11px] font-medium bg-secondary text-foreground">
                            {t("s3.active")}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.providerLabel}
                    </TableCell>
                    <TableCell className="truncate">
                      {truncateDisplay(entry.endpoint)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.region || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.bucket}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => onActivate(entry)}
                            aria-label="Activate S3 entry"
                          >
                            {t("s3.activate")}
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => onTest(entry)}
                          disabled={Boolean(testingKey)}
                          aria-label="Test S3 entry"
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => onEdit(entry)}
                          aria-label="Edit S3 entry"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => onDelete(entry.key)}
                          aria-label="Delete S3 entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    {t("s3.empty")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </OpenLoafSettingsGroup>
    </>
  );
}
