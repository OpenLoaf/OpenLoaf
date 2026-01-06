import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeatimeSettingsCard } from "@/components/ui/teatime/TeatimeSettingsCard";
import { TeatimeSettingsField } from "@/components/ui/teatime/TeatimeSettingsField";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { Switch } from "@/components/ui/switch";
import { Minus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { truncateDisplay, type S3ProviderEntry } from "@/components/setting/menus/provider/use-provider-management";
import type { Dispatch, SetStateAction } from "react";

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
  return (
    <>
      <TeatimeSettingsGroup
        title="S3 存储服务商"
        subtitle="配置对象存储服务商的 Endpoint 与访问凭证。"
        showBorder={false}
        className="pb-4"
      >
        <TeatimeSettingsCard divided className="bg-background">
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-100">
              <div className="text-sm font-medium">图片自动上传</div>
              <div className="text-xs text-muted-foreground">
                AI 对话需要公网访问图片时，将自动把图片上传到 S3。
              </div>
            </div>
            <TeatimeSettingsField>
              <Switch checked={autoUploadEnabled} onCheckedChange={onAutoUploadChange} />
            </TeatimeSettingsField>
          </div>
          <div className="flex flex-wrap items-start gap-2 py-3">
            <div className="min-w-0 sm:w-100">
              <div className="text-sm font-medium">S3 图片自动删除</div>
              <div className="text-xs text-muted-foreground">
                经过指定小时数后，自动从 S3 清理已上传的图片。
              </div>
            </div>
            <TeatimeSettingsField className="gap-2">
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
                {autoDeleteHours} 小时
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
            </TeatimeSettingsField>
          </div>
        </TeatimeSettingsCard>
      </TeatimeSettingsGroup>

      <TeatimeSettingsGroup
        title="服务商列表"
        subtitle="管理已添加的服务商配置，支持激活与测试。"
        showBorder={false}
        action={
          <Button variant="default" onClick={onAdd}>
            添加
          </Button>
        }
      >
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>服务商</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead className="text-right">操作</TableHead>
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
                          <span className="px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                            激活
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
                            激活
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
                    暂无 S3 存储服务商，点击右上角添加。
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </TeatimeSettingsGroup>
    </>
  );
}
