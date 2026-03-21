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

import { useState } from "react";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { toast } from "sonner";
import { Eye, EyeOff, Globe, Key, CheckCircle2, XCircle } from "lucide-react";

const DISABLED_PROVIDER_VALUE = "__disabled__";

const SEARCH_PROVIDERS = [
  { id: DISABLED_PROVIDER_VALUE, label: "未启用" },
  { id: "jina", label: "Jina Search" },
] as const;

export function WebSearchSettings() {
  const { basic, setBasic } = useBasicConfig();
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const provider = basic.webSearchProvider || "";
  // 中文注释：Radix Select 使用空串表示“清空选择”，这里用内部占位值承载“未启用”选项，避免运行时报错。
  const providerSelectValue = provider || DISABLED_PROVIDER_VALUE;
  const apiKey = basic.webSearchApiKey || "";

  const handleProviderChange = (value: string) => {
    setTestResult(null);
    void setBasic({
      webSearchProvider: value === DISABLED_PROVIDER_VALUE ? "" : value,
    });
  };

  const handleApiKeyChange = (value: string) => {
    setTestResult(null);
    void setBasic({ webSearchApiKey: value });
  };

  const handleTestConnection = async () => {
    if (!provider || !apiKey) {
      toast.error("请先选择搜索提供商并填写 API Key");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Retain-Images": "none",
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(
        `https://s.jina.ai/${encodeURIComponent("test connection")}`,
        {
          headers,
          signal: AbortSignal.timeout(15000),
        },
      );

      if (response.ok) {
        setTestResult("success");
        toast.success("搜索服务连接成功");
      } else {
        setTestResult("error");
        toast.error(`连接失败: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setTestResult("error");
      toast.error(`连接失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title="搜索提供商">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 py-2">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary">
              <Globe className="h-3 w-3 text-foreground" />
            </div>
            <Label className="text-sm font-medium">搜索服务</Label>
            <OpenLoafSettingsField>
              <Select value={providerSelectValue} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择搜索提供商" />
                </SelectTrigger>
                <SelectContent>
                  {SEARCH_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </OpenLoafSettingsField>
          </div>

          {provider && (
            <>
              <div className="flex flex-wrap items-center gap-2 py-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary">
                  <Key className="h-3 w-3 text-foreground" />
                </div>
                <Label className="text-sm font-medium">API Key</Label>
                <OpenLoafSettingsField className="flex items-center gap-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="输入 API Key"
                    className="w-[280px]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </OpenLoafSettingsField>
              </div>

              <div className="flex flex-wrap items-center gap-2 py-2">
                <div className="w-5" />
                <OpenLoafSettingsField className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-3xl bg-secondary text-secondary-foreground shadow-none hover:bg-accent"
                    disabled={testing || !apiKey}
                    onClick={() => void handleTestConnection()}
                  >
                    {testing ? "测试中..." : "测试连接"}
                  </Button>
                  {testResult === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-foreground" />
                  )}
                  {testResult === "error" && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </OpenLoafSettingsField>
              </div>
            </>
          )}
        </div>
      </OpenLoafSettingsGroup>

    </div>
  );
}
