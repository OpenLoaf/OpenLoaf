"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@openloaf/ui/button";
import { Input } from "@openloaf/ui/input";
import { Switch } from "@openloaf/ui/switch";
import { Label } from "@openloaf/ui/label";
import { resolveServerUrl } from "@/utils/server-url";
import { isElectronEnv } from "@/utils/is-electron-env";

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

type GateStatus = "checking" | "ready" | "locked" | "blocked" | "error";

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

/** Render local auth gate overlay. */
export default function LocalAuthGate({ children }: { children: React.ReactNode }) {
  const baseUrl = resolveServerUrl();
  const isElectron = isElectronEnv();
  // 逻辑：SSG 时 isElectron 为 false，会将遮罩烘焙进静态 HTML。
  // 使用 mounted 标记跳过首帧，确保静态 HTML 不包含遮罩，消除水合前的闪屏。
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<GateStatus>("checking");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMounted(true), []);

  const loadSession = useCallback(async () => {
    if (isElectron) {
      // 逻辑：桌面端直接放行，避免启动/热更新出现遮罩闪屏。
      setStatus("ready");
      return;
    }
    if (!baseUrl) {
      setStatus("ready");
      return;
    }
    try {
      const session = await fetchLocalAuthSession(baseUrl);
      if (session.isLocal) {
        setStatus("ready");
        return;
      }
      if (session.blocked) {
        setStatus("blocked");
        return;
      }
      if (session.loggedIn) {
        setStatus("ready");
        return;
      }
      setStatus("locked");
    } catch (err) {
      setStatus("error");
      setError((err as Error)?.message ?? "本地认证失败");
    }
  }, [baseUrl, isElectron]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleLogin = useCallback(async () => {
    if (!baseUrl) return;
    if (!password.trim()) {
      setError("请输入访问密码");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/local-auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error === "local_auth_invalid") {
          throw new Error("密码错误，请重试");
        }
        throw new Error("登录失败，请重试");
      }
      setPassword("");
      await loadSession();
    } catch (err) {
      setError((err as Error)?.message ?? "登录失败");
    } finally {
      setSubmitting(false);
    }
  }, [baseUrl, loadSession, password, remember]);

  if (!mounted || isElectron || status === "ready") {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-6 shadow-lg">
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">本地访问验证</h1>
            {status === "blocked" ? (
              <p className="text-sm text-muted-foreground">
                当前服务器未设置本地访问密码，远程访问已被阻止。请在本机打开设置页配置密码。
              </p>
            ) : status === "error" ? (
              <p className="text-sm text-muted-foreground">
                {error ?? "无法验证本地访问状态"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                远程访问需要输入本地访问密码。
              </p>
            )}
          </div>

          {status === "locked" ? (
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-auth-password">访问密码</Label>
                <Input
                  id="local-auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入本地访问密码"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <Label htmlFor="local-auth-remember" className="text-sm">
                  记住本次登录
                </Label>
                <Switch
                  id="local-auth-remember"
                  checked={remember}
                  onCheckedChange={setRemember}
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Button type="button" className="w-full" onClick={() => void handleLogin()} disabled={submitting}>
                {submitting ? "验证中…" : "进入 OpenLoaf"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
