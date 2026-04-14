/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// 不加 "use client"：只会被 "use client" 父组件引入，避免触发 Next.js
// 跨 RSC 边界的 serializable-props 警告（这里 onRemove 是父子同在客户端
// 的普通回调，不是 Server Action）。
import { useTranslation } from "react-i18next";
import { ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@openloaf/ui/button";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import {
  describeRule,
  type ToolApprovalRules,
} from "@openloaf/api/types/toolApproval";

export type ToolApprovalRulesListProps = {
  /** Resolved rules for the current scope. */
  rules: ToolApprovalRules;
  /** Called when the user deletes a rule. */
  onRemove: (rule: string, behavior: "allow" | "deny") => Promise<void> | void;
  /** Which scope is being displayed — affects the scope description text. */
  scope: "temp" | "project";
};

/**
 * Shared list component used by both the global and project tool-approval
 * settings pages. Encapsulates:
 *   - scope description header
 *   - rendered allow list with human-readable labels + raw rule tooltip
 *   - deny list (read + delete; editing is out of scope for this view)
 *   - strong empty state
 *   - semantic ul/li markup for a11y
 */
export function ToolApprovalRulesList({
  rules,
  onRemove,
  scope,
}: ToolApprovalRulesListProps) {
  const { t } = useTranslation("settings");
  const allowList = rules.allow ?? [];
  const denyList = rules.deny ?? [];
  const scopeNoteKey =
    scope === "project"
      ? "toolApproval.projectScopeNote"
      : "toolApproval.tempChatScopeNote";

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={t("toolApproval.title")}>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(scopeNoteKey)}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("toolApproval.alwaysAllowHint")}
          </p>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("toolApproval.allowedList")}>
        {allowList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              {t("toolApproval.emptyTitle")}
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              {t("toolApproval.emptyList")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1 py-2">
            {allowList.map((rule) => (
              <RuleRow
                key={`allow-${rule}`}
                rule={rule}
                behavior="allow"
                onRemove={onRemove}
                removeLabel={t("toolApproval.remove")}
              />
            ))}
          </ul>
        )}
      </OpenLoafSettingsGroup>

      {denyList.length > 0 && (
        <OpenLoafSettingsGroup title={t("toolApproval.denyList")}>
          <p className="px-2 pb-2 text-xs text-muted-foreground leading-relaxed">
            {t("toolApproval.denyHint")}
          </p>
          <ul className="flex flex-col gap-1 py-2">
            {denyList.map((rule) => (
              <RuleRow
                key={`deny-${rule}`}
                rule={rule}
                behavior="deny"
                onRemove={onRemove}
                removeLabel={t("toolApproval.remove")}
              />
            ))}
          </ul>
        </OpenLoafSettingsGroup>
      )}
    </div>
  );
}

type RuleRowProps = {
  rule: string;
  behavior: "allow" | "deny";
  onRemove: (rule: string, behavior: "allow" | "deny") => Promise<void> | void;
  removeLabel: string;
};

function RuleRow({ rule, behavior, onRemove, removeLabel }: RuleRowProps) {
  const { t } = useTranslation("settings");
  const description = describeRule(rule);
  const label =
    description.labelKey !== null ? t(description.labelKey) : description.toolName;
  const detailText = description.detail ?? t("toolApproval.describe.any");
  const isDeny = behavior === "deny";

  return (
    <li
      className={`group flex items-center gap-2 rounded px-2 py-1 transition-colors ${
        isDeny ? "hover:bg-destructive/5" : "hover:bg-muted/50"
      }`}
      title={rule}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-xs ${
            isDeny ? "text-destructive" : "text-foreground"
          }`}
        >
          <span className="font-medium">{label}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <code className="font-mono text-muted-foreground">{detailText}</code>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => void onRemove(rule, behavior)}
        aria-label={removeLabel}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </li>
  );
}
