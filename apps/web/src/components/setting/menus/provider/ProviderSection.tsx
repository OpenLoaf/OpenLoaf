import { Fragment, type Dispatch, type SetStateAction } from "react";
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
import { getModelLabel } from "@/lib/model-registry";
import { Check, ChevronDown, ChevronUp, Copy, Pencil, Trash2 } from "lucide-react";
import { ModelIcon } from "@/components/setting/menus/provider/ModelIcon";
import {
  copyToClipboard,
  formatModelPriceLabel,
  getProviderCapabilities,
  MODEL_TAG_LABELS,
  resolveMergedModelDefinition,
  truncateDisplay,
  type ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";

type ProviderSectionProps = {
  /** Provider list entries. */
  entries: ProviderEntry[];
  /** Expanded rows map. */
  expandedProviders: Record<string, boolean>;
  /** Copied key indicator. */
  copiedKey: string | null;
  /** Open editor callback. */
  onAdd: () => void;
  /** Edit entry callback. */
  onEdit: (entry: ProviderEntry) => void;
  /** Delete entry callback. */
  onDelete: (key: string) => void;
  /** Update copied key state. */
  onCopiedKeyChange: Dispatch<SetStateAction<string | null>>;
  /** Toggle expanded rows. */
  onToggleExpand: (key: string) => void;
};

/**
 * Render model tags for a model.
 */
function renderModelTagsCompact(tags?: (keyof typeof MODEL_TAG_LABELS)[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {(tags ?? []).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {MODEL_TAG_LABELS[tag] ?? tag}
        </span>
      ))}
    </div>
  );
}

/**
 * Render provider list and detail rows.
 */
export function ProviderSection({
  entries,
  expandedProviders,
  copiedKey,
  onAdd,
  onEdit,
  onDelete,
  onCopiedKeyChange,
  onToggleExpand,
}: ProviderSectionProps) {
  return (
    <>
      <TeatimeSettingsGroup
        title="AI 服务商"
        subtitle="配置模型服务商的 API URL 与认证信息。"
        showBorder={false}
        action={
          <Button variant="default" onClick={onAdd}>
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
              <TableHead>AI 服务商</TableHead>
              <TableHead>能力</TableHead>
              <TableHead>API URL</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isExpanded = Boolean(expandedProviders[entry.key]);
              const entryCustomModels = entry.customModels ?? [];
              const capabilities = getProviderCapabilities(entry.providerId, entryCustomModels);
              return (
                <Fragment key={entry.key}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onToggleExpand(entry.key)}
                          aria-label={isExpanded ? "收起模型列表" : "展开模型列表"}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        <span>{entry.key}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {capabilities.length > 0 ? renderModelTagsCompact(capabilities) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="w-full">
                          <div className="text-sm truncate">{truncateDisplay(entry.apiUrl)}</div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-muted-foreground/70"
                          onClick={async () => {
                            await copyToClipboard(entry.apiUrl);
                            onCopiedKeyChange(entry.key);
                            window.setTimeout(() => {
                              onCopiedKeyChange((prev) => (prev === entry.key ? null : prev));
                            }, 1200);
                          }}
                          aria-label="复制 API URL"
                        >
                          {copiedKey === entry.key ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => onEdit(entry)}
                          aria-label="Edit key"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={() => onDelete(entry.key)}
                          aria-label="Delete key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded ? (
                    <TableRow>
                      <TableCell colSpan={4} className="p-0">
                        <div className="px-4 pb-4">
                          <div className="hidden md:grid grid-cols-[200px_1fr_1.2fr] gap-3 px-1 py-2 text-xs font-semibold text-muted-foreground">
                            <div>模型</div>
                            <div>能力</div>
                            <div>价格</div>
                          </div>
                          <div className="divide-y divide-border/60">
                            {Object.keys(entry.models).map((modelId) => {
                              const modelDefinition =
                                resolveMergedModelDefinition(
                                  entry.providerId,
                                  modelId,
                                  entryCustomModels,
                                ) ?? entry.models[modelId];
                              if (!modelDefinition) return null;
                              return (
                                <div
                                  key={`${entry.key}-${modelId}`}
                                  className="grid grid-cols-1 gap-3 px-1 py-3 text-sm md:grid-cols-[200px_1fr_1.2fr]"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <ModelIcon icon={modelDefinition.icon} />
                                      <div className="text-foreground">
                                        {getModelLabel(modelDefinition)}
                                      </div>
                                    </div>
                                  </div>
                                  <div>{renderModelTagsCompact(modelDefinition.tags)}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatModelPriceLabel(modelDefinition)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}

            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                  暂无 AI 服务商，点击右上角添加。
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
