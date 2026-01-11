"use client";

import { useMemo } from "react";
import { shellCommandAllowlistEntries } from "@tenas-ai/api/types/tools/system";
import { RiskType } from "@tenas-ai/api/types/toolResult";
import { TenasSettingsGroup } from "@/components/ui/tenas/TenasSettingsGroup";
import { cn } from "@/lib/utils";

type RiskLabel = {
  label: string;
  className: string;
};

/**
 * 获取风险等级在 UI 中的展示信息。
 */
function getRiskLabel(riskType: RiskType): RiskLabel {
  switch (riskType) {
    case RiskType.Read:
      return { label: "只读", className: "text-emerald-600 dark:text-emerald-400" };
    case RiskType.Write:
      return { label: "写入（需审批）", className: "text-amber-600 dark:text-amber-400" };
    case RiskType.Destructive:
      return { label: "破坏（需审批）", className: "text-red-600 dark:text-red-400" };
  }
}

export function CommandAllowlist() {
  const entries = useMemo(() => {
    return [...shellCommandAllowlistEntries].sort((a, b) =>
      a.command.localeCompare(b.command),
    );
  }, []);

  return (
    <div className="space-y-3">
      <TenasSettingsGroup
        title="白名单"
        subtitle="以下为系统工具允许执行的指令白名单（MVP）。规则以服务端校验为准。"
        showBorder={false}
      >
        {null}
      </TenasSettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_2fr] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>指令</div>
          <div>风险</div>
          <div>说明</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => {
            const risk = getRiskLabel(entry.riskType);
            return (
              <div
                key={entry.id}
                className={cn(
                  "grid grid-cols-[1fr_140px_2fr] gap-3 items-start px-4 py-3",
                  "bg-background hover:bg-muted/15 transition-colors",
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.command}</div>
                </div>

                <div className={cn("text-sm font-medium", risk.className)}>
                  {risk.label}
                </div>

                <div className="text-sm text-muted-foreground">{entry.description}</div>
              </div>
            );
          })}

          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无白名单指令。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
