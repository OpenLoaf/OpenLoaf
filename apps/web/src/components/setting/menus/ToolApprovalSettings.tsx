/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { Plus, Trash2 } from "lucide-react";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveServerUrl } from "@/utils/server-url";

type ToolApprovalRules = { allow?: string[]; deny?: string[] };

// ─── Presets ────────────────────────────────────────────────────────────────

const PRESETS: Array<{
  id: string;
  label: string;
  rules: ToolApprovalRules;
}> = [
  {
    id: "developer",
    label: "开发者常用",
    rules: {
      allow: [
        "Bash(git *)",
        "Bash(npm *)",
        "Bash(pnpm *)",
        "Bash(yarn *)",
        "Bash(node *)",
        "Bash(npx *)",
        "Bash(ls *)",
        "Bash(cat *)",
      ],
    },
  },
  {
    id: "readonly",
    label: "只读模式",
    rules: {
      allow: ["Read", "Glob", "Grep"],
    },
  },
  {
    id: "trust-all",
    label: "完全信任",
    rules: {
      allow: ["Bash", "Edit", "Write", "Read", "Glob", "Grep"],
    },
  },
];

// ─── API helpers ────────────────────────────────────────────────────────────

async function fetchRules(): Promise<ToolApprovalRules> {
  const baseUrl = resolveServerUrl();
  const url = baseUrl ? `${baseUrl}/api/trpc/settings.getToolApprovalRules` : "/api/trpc/settings.getToolApprovalRules";
  const res = await fetch(url, { credentials: "include", headers: CLIENT_HEADERS });
  if (!res.ok) return {};
  const json = await res.json();
  return json?.result?.data ?? {};
}

async function saveRules(rules: ToolApprovalRules): Promise<void> {
  const baseUrl = resolveServerUrl();
  const url = baseUrl ? `${baseUrl}/api/trpc/settings.setToolApprovalRules` : "/api/trpc/settings.setToolApprovalRules";
  await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", ...CLIENT_HEADERS },
    body: JSON.stringify(rules),
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ToolApprovalSettings() {
  const { t } = useTranslation("settings");
  const [rules, setRules] = useState<ToolApprovalRules>({});
  const [newAllowRule, setNewAllowRule] = useState("");
  const [newDenyRule, setNewDenyRule] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRules().then((r) => {
      setRules(r);
      setLoading(false);
    });
  }, []);

  const persist = useCallback(async (next: ToolApprovalRules) => {
    setRules(next);
    await saveRules(next);
  }, []);

  const addRule = useCallback(
    (behavior: "allow" | "deny", rule: string) => {
      if (!rule.trim()) return;
      const list = [...(rules[behavior] ?? [])];
      if (list.includes(rule.trim())) return;
      list.push(rule.trim());
      persist({ ...rules, [behavior]: list });
      if (behavior === "allow") setNewAllowRule("");
      else setNewDenyRule("");
    },
    [rules, persist],
  );

  const removeRule = useCallback(
    (behavior: "allow" | "deny", rule: string) => {
      const list = (rules[behavior] ?? []).filter((r) => r !== rule);
      persist({ ...rules, [behavior]: list.length > 0 ? list : undefined });
    },
    [rules, persist],
  );

  const applyPreset = useCallback(
    (preset: ToolApprovalRules) => {
      const merged = {
        allow: [...new Set([...(rules.allow ?? []), ...(preset.allow ?? [])])],
        deny: [...new Set([...(rules.deny ?? []), ...(preset.deny ?? [])])],
      };
      persist({
        allow: merged.allow.length > 0 ? merged.allow : undefined,
        deny: merged.deny.length > 0 ? merged.deny : undefined,
      });
    },
    [rules, persist],
  );

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={t("toolApproval.allowRules", "允许规则")}>
        <div className="flex flex-col gap-2 py-2">
          <div className="text-xs text-muted-foreground mb-1">
            匹配的工具调用将自动批准，无需手动确认
          </div>
          {(rules.allow ?? []).map((rule) => (
            <div key={rule} className="flex items-center gap-2 group">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono">
                {rule}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeRule("allow", rule)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-xs font-mono"
              placeholder='例如: Bash(git *), Edit(/src/**)'
              value={newAllowRule}
              onChange={(e) => setNewAllowRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addRule("allow", newAllowRule);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => addRule("allow", newAllowRule)}
              disabled={!newAllowRule.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("toolApproval.denyRules", "拒绝规则")}>
        <div className="flex flex-col gap-2 py-2">
          <div className="text-xs text-muted-foreground mb-1">
            匹配的工具调用将始终要求手动审批（优先级高于允许规则）
          </div>
          {(rules.deny ?? []).map((rule) => (
            <div key={rule} className="flex items-center gap-2 group">
              <code className="flex-1 rounded bg-destructive/10 px-2 py-1 text-xs font-mono text-destructive">
                {rule}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeRule("deny", rule)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              className="h-8 text-xs font-mono"
              placeholder='例如: Bash(rm -rf *)'
              value={newDenyRule}
              onChange={(e) => setNewDenyRule(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addRule("deny", newDenyRule);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => addRule("deny", newDenyRule)}
              disabled={!newDenyRule.trim()}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("toolApproval.presets", "快速预设")}>
        <div className="flex flex-col gap-2 py-2">
          <div className="text-xs text-muted-foreground mb-1">
            一键应用常用规则集合（追加到现有规则）
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => applyPreset(preset.rules)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("toolApproval.ruleFormat", "规则格式说明")}>
        <div className="text-xs text-muted-foreground space-y-1 py-2">
          <p><code className="bg-muted px-1 rounded">Bash</code> — 允许所有 Bash 命令</p>
          <p><code className="bg-muted px-1 rounded">Bash(git *)</code> — 允许 git 相关命令</p>
          <p><code className="bg-muted px-1 rounded">Edit(/src/**)</code> — 允许编辑 /src/ 下文件</p>
          <p><code className="bg-muted px-1 rounded">Write</code> — 允许所有文件写入</p>
        </div>
      </OpenLoafSettingsGroup>
    </div>
  );
}
