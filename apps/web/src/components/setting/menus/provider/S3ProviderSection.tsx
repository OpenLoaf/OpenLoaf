import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeatimeSettingsGroup } from "@/components/ui/teatime/TeatimeSettingsGroup";
import { Pencil, Trash2, Upload } from "lucide-react";
import { truncateDisplay, type S3ProviderEntry } from "@/components/setting/menus/provider/use-provider-management";

type S3ProviderSectionProps = {
  /** S3 entries list. */
  entries: S3ProviderEntry[];
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
        action={
          <Button variant="outline" onClick={onAdd}>
            添加
          </Button>
        }
      >
        {null}
      </TeatimeSettingsGroup>

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
    </>
  );
}
