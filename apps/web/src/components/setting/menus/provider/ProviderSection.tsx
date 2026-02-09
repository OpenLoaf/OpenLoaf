import { Fragment } from "react";
import { Button } from "@tenas-ai/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tenas-ai/ui/table";
import { TenasSettingsGroup } from "@tenas-ai/ui/tenas/TenasSettingsGroup";
import { getModelLabel } from "@/lib/model-registry";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { ModelIcon } from "@/components/setting/menus/provider/ModelIcon";
import {
  getProviderCapabilities,
  MODEL_TAG_LABELS,
  resolveMergedModelDefinition,
  truncateDisplay,
  type ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";
import type { ModelDefinition } from "@tenas-ai/api/common";

type ProviderSectionProps = {
  /** Provider list entries. */
  entries: ProviderEntry[];
  /** Expanded rows map. */
  expandedProviders: Record<string, boolean>;
  /** Open editor callback. */
  onAdd: () => void;
  /** Edit entry callback. */
  onEdit: (entry: ProviderEntry) => void;
  /** Delete entry callback. */
  onDelete: (key: string) => void;
  /** Toggle expanded rows. */
  onToggleExpand: (key: string) => void;
  /** Edit model callback. */
  onModelEdit: (entry: ProviderEntry, model: ModelDefinition) => void;
  /** Delete model callback. */
  onModelDelete: (entry: ProviderEntry, modelId: string) => void;
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
  onAdd,
  onEdit,
  onDelete,
  onToggleExpand,
  onModelEdit,
  onModelDelete,
}: ProviderSectionProps) {
  return (
    <>
      <TenasSettingsGroup
        title="AI 服务商"
        subtitle="配置模型服务商的 API URL 与认证信息，添加后即可使用 AI 模型服务。"
        showBorder={false}
        action={
          <Button variant="default" onClick={onAdd}>
            添加
          </Button>
        }
      >
        {null}
      </TenasSettingsGroup>

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
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => onToggleExpand(entry.key)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleExpand(entry.key);
                          }}
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
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(entry);
                          }}
                          aria-label="Edit key"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(entry.key);
                          }}
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
                          <div className="divide-y divide-border/60">
                            {Object.keys(entry.models).map((modelId) => {
                              const modelDefinition =
                                resolveMergedModelDefinition(
                                  entry.providerId,
                                  modelId,
                                  entryCustomModels,
                                ) ?? entry.models[modelId];
                              if (!modelDefinition) return null;
                              const isCustomModel = entryCustomModels.some(
                                (model) => model.id === modelDefinition.id,
                              );
                              return (
                                <div
                                  key={`${entry.key}-${modelId}`}
                                  className="grid grid-cols-1 gap-3 px-1 py-3 text-sm md:grid-cols-[260px_1fr_120px]"
                                >
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <ModelIcon
                                        icon={modelDefinition.familyId ?? modelDefinition.icon}
                                      />
                                      <div className="text-foreground">
                                        {getModelLabel(modelDefinition)}
                                      </div>
                                    </div>
                                  </div>
                                  <div>{renderModelTagsCompact(modelDefinition.tags)}</div>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => onModelEdit(entry, modelDefinition)}
                                      disabled={!isCustomModel}
                                      title={isCustomModel ? "编辑模型" : "仅支持编辑自定义模型"}
                                      aria-label="编辑模型"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => onModelDelete(entry, modelDefinition.id)}
                                      aria-label="删除模型"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
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
