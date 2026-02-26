/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import { resolveServerUrl } from "@/utils/server-url";

type LocalAuthSessionResponse = {
  /** Whether request is local. */
  isLocal: boolean;
  /** Whether local password is configured. */
  configured: boolean;
  /** Whether the session is logged in. */
  loggedIn: boolean;
  /** Whether remote access requires login. */
  requiresAuth: boolean;
  /** Whether remote access is blocked due to missing password. */
  blocked: boolean;
  /** Password updated time. */
  updatedAt?: string;
};

/** Fetch local auth session snapshot. */
async function fetchLocalAuthSession(baseUrl: string): Promise<LocalAuthSessionResponse> {
  const response = await fetch(`${baseUrl}/local-auth/session`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("无法获取本地访问状态");
  }
  return (await response.json()) as LocalAuthSessionResponse;
}

/** Render local access settings panel. */
export default function LocalAccess() {
  const baseUrl = resolveServerUrl();
  const [configured, setConfigured] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!baseUrl) return;
    try {
      const session = await fetchLocalAuthSession(baseUrl);
      setConfigured(session.configured);
      setUpdatedAt(session.updatedAt ?? null);
    } catch (error) {
      toast.error((error as Error)?.message ?? "无法读取本地访问状态");
    }
  }, [baseUrl]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSubmit = useCallback(async () => {
    if (!baseUrl) return;
    if (!password.trim() || password.trim().length < 6) {
      toast.error("密码至少 6 位");
      return;
    }
    if (password !== confirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${baseUrl}/local-auth/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: password.trim(),
          currentPassword: currentPassword.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error === "local_auth_invalid") {
          throw new Error("当前密码不正确");
        }
        if (payload?.error === "local_only") {
          throw new Error("请在本机打开设置页配置密码");
        }
        throw new Error("保存失败，请重试");
      }
      toast.success(configured ? "密码已更新" : "密码已设置");
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      await loadStatus();
    } catch (error) {
      toast.error((error as Error)?.message ?? "保存失败");
    } finally {
      setLoading(false);
    }
  }, [baseUrl, confirm, configured, currentPassword, loadStatus, password]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">本地访问密码</h2>
        <p className="text-sm text-muted-foreground">
          当从局域网或外网访问本地服务器时，需要先输入本地访问密码。
        </p>
        <p className="text-xs text-muted-foreground">
          当前状态：{configured ? "已设置" : "未设置"}
          {updatedAt ? `（更新于 ${updatedAt}）` : ""}
        </p>
      </div>

      <div className="space-y-4">
        {configured ? (
          <div className="space-y-2">
            <Label htmlFor="local-auth-current">当前密码</Label>
            <Input
              id="local-auth-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="请输入当前密码"
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="local-auth-new">新密码</Label>
          <Input
            id="local-auth-new"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入新密码"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-auth-confirm">确认新密码</Label>
          <Input
            id="local-auth-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="请再次输入新密码"
          />
        </div>

        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? "保存中…" : configured ? "更新密码" : "设置密码"}
        </Button>
      </div>
    </div>
  );
}
