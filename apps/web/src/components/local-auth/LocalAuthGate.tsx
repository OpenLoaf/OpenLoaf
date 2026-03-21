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

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
async function fetchLocalAuthSession(
  baseUrl: string,
  errMsg: string,
): Promise<LocalAuthSessionResponse> {
  const response = await fetch(`${baseUrl}/local-auth/session`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(errMsg);
  }
  return (await response.json()) as LocalAuthSessionResponse;
}

/** Render local auth gate overlay. */
export default function LocalAuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("common");
  const tRef = useRef(t);
  tRef.current = t;
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
      const session = await fetchLocalAuthSession(baseUrl, tRef.current("localAuth.fetchError"));
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
      setError((err as Error)?.message ?? tRef.current("localAuth.authFailed"));
    }
  }, [baseUrl, isElectron]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleLogin = useCallback(async () => {
    if (!baseUrl) return;
    if (!password.trim()) {
      setError(t("localAuth.passwordRequired"));
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
          throw new Error(t("localAuth.invalidPassword"));
        }
        throw new Error(t("localAuth.loginFailed"));
      }
      setPassword("");
      await loadSession();
    } catch (err) {
      setError((err as Error)?.message ?? t("localAuth.loginFailed"));
    } finally {
      setSubmitting(false);
    }
  }, [baseUrl, loadSession, password, remember, t]);

  if (!mounted || isElectron || status === "checking" || status === "ready") {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-[70] flex items-center justify-center ol-glass-float p-6">
        <div className="w-full max-w-md rounded-3xl border border-border/60 bg-background p-6 shadow-lg">
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">{t("localAuth.title")}</h1>
            {status === "blocked" ? (
              <p className="text-sm text-muted-foreground">
                {t("localAuth.blockedDesc")}
              </p>
            ) : status === "error" ? (
              <p className="text-sm text-muted-foreground">
                {error ?? t("localAuth.verifyError")}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("localAuth.lockedDesc")}
              </p>
            )}
          </div>

          {status === "locked" ? (
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-auth-password">{t("localAuth.passwordLabel")}</Label>
                <Input
                  id="local-auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("localAuth.passwordPlaceholder")}
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-between rounded-3xl border border-border/60 px-3 py-2">
                <Label htmlFor="local-auth-remember" className="text-sm">
                  {t("localAuth.rememberLogin")}
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
                {submitting ? t("localAuth.verifying") : t("localAuth.enterBtn")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
