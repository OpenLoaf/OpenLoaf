/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { Fragment } from "react";
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
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { getModelLabel } from "@/lib/model-registry";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { ModelIcon } from "@/components/setting/menus/provider/ModelIcon";
import {
  getProviderCapabilities,
  resolveMergedModelDefinition,
  truncateDisplay,
  type ProviderEntry,
} from "@/components/setting/menus/provider/use-provider-management";
import type { ModelDefinition } from "@openloaf/api/common";

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
function renderModelTagsCompact(tags: string[] | undefined, getTagLabel: (tag: string) => string) {
  return (
    <div className="flex flex-wrap gap-1">
      {(tags ?? []).map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-3xl border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {getTagLabel(tag)}
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
  const { t } = useTranslation('settings');
  const { t: tAi } = useTranslation('ai');
  const getTagLabel = (tag: string) => tAi(`modelTags.${tag}`, { defaultValue: tag });
  return (
    <>
      <OpenLoafSettingsGroup
        title={t('provider.sectionTitle')}
        subtitle={t('provider.sectionSubtitle')}
        showBorder={false}
        action={
          <Button variant="default" onClick={onAdd}>
            {t('provider.addButton')}
          </Button>
        }
      >
        {null}
      </OpenLoafSettingsGroup>

      <div className="rounded-3xl border border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>{t('provider.sectionTitle')}</TableHead>
              <TableHead>{t('provider.tableHeadCapabilities')}</TableHead>
              <TableHead>API URL</TableHead>
              <TableHead className="text-right">{t('provider.tableHeadActions')}</TableHead>
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
                          aria-label={isExpanded ? t('provider.collapseModels') : t('provider.expandModels')}
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
                      {capabilities.length > 0 ? renderModelTagsCompact(capabilities, getTagLabel) : "-"}
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
                          <div className="divide-y divide-border/40">
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
                                  <div>{renderModelTagsCompact(modelDefinition.tags, getTagLabel)}</div>
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => onModelEdit(entry, modelDefinition)}
                                      disabled={!isCustomModel}
                                      title={isCustomModel ? t('provider.editModel') : t('provider.canOnlyEditCustomModels')}
                                      aria-label={t('provider.editModel')}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => onModelDelete(entry, modelDefinition.id)}
                                      aria-label={t('provider.deleteModel')}
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
                  {t('provider.emptyProviders')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
