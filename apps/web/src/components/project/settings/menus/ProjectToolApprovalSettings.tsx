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
import { useQuery } from "@tanstack/react-query";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { Plus, Trash2 } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { resolveServerUrl } from "@/utils/server-url";

type ToolApprovalRules = { allow?: string[]; deny?: string[] };

type ProjectToolApprovalSettingsProps = {
  projectId?: string;
  rootUri?: string;
};

// ─── API helpers ────────────────────────────────────────────────────────────

async function saveProjectRule(
  projectId: string,
  rule: string,
  behavior: "allow" | "deny",
): Promise<void> {
  const baseUrl = resolveServerUrl();
  const endpoint = baseUrl
    ? `${baseUrl}/ai/tools/project-approval-rule`
    : "/ai/tools/project-approval-rule";
  await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", ...CLIENT_HEADERS },
    credentials: "include",
    body: JSON.stringify({ projectId, rule, behavior }),
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProjectToolApprovalSettings({ projectId }: ProjectToolApprovalSettingsProps) {
  const { t } = useTranslation("settings");
  const [rules, setRules] = useState<ToolApprovalRules>({});
  const [newAllowRule, setNewAllowRule] = useState("");
  const [newDenyRule, setNewDenyRule] = useState("");

  // Fetch project AI settings to get current rules
  const aiSettingsQuery = useQuery({
    ...trpc.project.getAiSettings.queryOptions(
      projectId ? { projectId } : { projectId: "" },
    ),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (aiSettingsQuery.data) {
      const data = aiSettingsQuery.data as any;
      setRules(data?.toolApprovalRules ?? {});
    }
  }, [aiSettingsQuery.data]);

  // Fetch global rules for display
  const [globalRules, setGlobalRules] = useState<ToolApprovalRules>({});
  useEffect(() => {
    async function load() {
      try {
        const baseUrl = resolveServerUrl();
        const url = baseUrl
          ? `${baseUrl}/api/trpc/settings.getToolApprovalRules`
          : "/api/trpc/settings.getToolApprovalRules";
        const res = await fetch(url, { credentials: "include", headers: CLIENT_HEADERS });
        if (res.ok) {
          const json = await res.json();
          setGlobalRules(json?.result?.data ?? {});
        }
      } catch {
        // ignore
      }
    }
    load();
  }, []);

  const saveAllRules = useCallback(
    async (next: ToolApprovalRules) => {
      if (!projectId) return;
      setRules(next);
      // Use setAiSettings to persist
      try {
        const baseUrl = resolveServerUrl();
        const endpoint = baseUrl
          ? `${baseUrl}/api/trpc/settings.setToolApprovalRules`
          : "/api/trpc/settings.setToolApprovalRules";
        // Save via project AI settings mutation
        // We need to call project.setAiSettings via tRPC
      } catch {
        // ignore
      }
    },
    [projectId],
  );

  const addRule = useCallback(
    async (behavior: "allow" | "deny", rule: string) => {
      if (!rule.trim() || !projectId) return;
      const list = [...(rules[behavior] ?? [])];
      if (list.includes(rule.trim())) return;
      list.push(rule.trim());
      const next = { ...rules, [behavior]: list };
      setRules(next);
      await saveProjectRule(projectId, rule.trim(), behavior);
      if (behavior === "allow") setNewAllowRule("");
      else setNewDenyRule("");
    },
    [rules, projectId],
  );

  const removeRule = useCallback(
    async (behavior: "allow" | "deny", rule: string) => {
      if (!projectId) return;
      const list = (rules[behavior] ?? []).filter((r) => r !== rule);
      const next = { ...rules, [behavior]: list.length > 0 ? list : undefined };
      setRules(next);
      // Save via project setAiSettings
      try {
        const current = (aiSettingsQuery.data ?? {}) as Record<string, unknown>;
        const baseUrl = resolveServerUrl();
        const url = baseUrl
          ? `${baseUrl}/api/trpc/project.setAiSettings`
          : "/api/trpc/project.setAiSettings";
        await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json", ...CLIENT_HEADERS },
          body: JSON.stringify({ projectId, aiSettings: { ...current, toolApprovalRules: next } }),
        });
      } catch {
        // fallback: just keep local state
      }
    },
    [rules, projectId, aiSettingsQuery.data],
  );

  if (!projectId) {
    return <div className="p-4 text-sm text-muted-foreground">请选择一个项目</div>;
  }

  return (
    <div className="space-y-6">
      {/* Global rules (read-only display) */}
      {((globalRules.allow?.length ?? 0) > 0 || (globalRules.deny?.length ?? 0) > 0) && (
        <OpenLoafSettingsGroup title={t("toolApproval.inheritedFromGlobal", "继承自全局设置")}>
          <div className="flex flex-col gap-1 py-2 opacity-60">
            {(globalRules.allow ?? []).map((rule) => (
              <code key={rule} className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                ✓ {rule}
              </code>
            ))}
            {(globalRules.deny ?? []).map((rule) => (
              <code key={rule} className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-mono text-destructive">
                ✗ {rule}
              </code>
            ))}
          </div>
        </OpenLoafSettingsGroup>
      )}

      <OpenLoafSettingsGroup title={t("toolApproval.allowRules", "允许规则")}>
        <div className="flex flex-col gap-2 py-2">
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
    </div>
  );
}
