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
async function fetchLocalAuthSession(baseUrl: string, t: (key: string) => string): Promise<LocalAuthSessionResponse> {
  const response = await fetch(`${baseUrl}/local-auth/session`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(t('localAccess.fetchStatusError'));
  }
  return (await response.json()) as LocalAuthSessionResponse;
}

/** Render local access settings panel. */
export default function LocalAccess() {
  const { t } = useTranslation('settings');
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
      const session = await fetchLocalAuthSession(baseUrl, t);
      setConfigured(session.configured);
      setUpdatedAt(session.updatedAt ?? null);
    } catch (error) {
      toast.error((error as Error)?.message ?? t('localAccess.readStatusError'));
    }
  }, [baseUrl, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSubmit = useCallback(async () => {
    if (!baseUrl) return;
    if (!password.trim() || password.trim().length < 6) {
      toast.error(t('localAccess.passwordMinLength'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('localAccess.passwordMismatch'));
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
          throw new Error(t('localAccess.invalidCurrentPassword'));
        }
        if (payload?.error === "local_only") {
          throw new Error(t('localAccess.localOnlyError'));
        }
        throw new Error(t('localAccess.saveFailed'));
      }
      toast.success(configured ? t('localAccess.passwordUpdated') : t('localAccess.passwordSet'));
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      await loadStatus();
    } catch (error) {
      toast.error((error as Error)?.message ?? t('localAccess.saveFailedGeneral'));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, confirm, configured, currentPassword, loadStatus, password, t]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('localAccess.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('localAccess.description')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('localAccess.status')}{configured ? t('localAccess.configured') : t('localAccess.notConfigured')}
          {updatedAt ? ` (${t('localAccess.updatedAt', { date: updatedAt })})` : ""}
        </p>
      </div>

      <div className="space-y-4">
        {configured ? (
          <div className="space-y-2">
            <Label htmlFor="local-auth-current">{t('localAccess.currentPassword')}</Label>
            <Input
              id="local-auth-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('localAccess.currentPasswordPlaceholder')}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="local-auth-new">{t('localAccess.newPassword')}</Label>
          <Input
            id="local-auth-new"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('localAccess.newPasswordPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-auth-confirm">{t('localAccess.confirmPassword')}</Label>
          <Input
            id="local-auth-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('localAccess.confirmPasswordPlaceholder')}
          />
        </div>

        <Button type="button" onClick={() => void handleSubmit()} disabled={loading}>
          {loading ? t('localAccess.saving') : configured ? t('localAccess.updatePassword') : t('localAccess.setPassword')}
        </Button>
      </div>
    </div>
  );
}
