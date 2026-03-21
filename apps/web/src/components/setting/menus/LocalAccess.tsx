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
import { Switch } from "@openloaf/ui/animate-ui/components/radix/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField";
import { Globe, KeyRound } from "lucide-react";
import { resolveServerUrl } from "@/utils/server-url";

type LocalAuthSessionResponse = {
  isLocal: boolean;
  configured: boolean;
  externalAccessEnabled: boolean;
  loggedIn: boolean;
  requiresAuth: boolean;
  blocked: boolean;
  updatedAt?: string;
};

type PasswordDialogMode = "set" | "change" | null;

export default function LocalAccess() {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const baseUrl = resolveServerUrl();

  const [configured, setConfigured] = useState(false);
  const [externalAccessEnabled, setExternalAccessEnabled] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<PasswordDialogMode>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dialogLoading, setDialogLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!baseUrl) return;
    try {
      const response = await fetch(`${baseUrl}/local-auth/session`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(t("localAccess.fetchStatusError"));
      const session = (await response.json()) as LocalAuthSessionResponse;
      setConfigured(session.configured);
      setExternalAccessEnabled(session.externalAccessEnabled);
      setUpdatedAt(session.updatedAt ?? null);
    } catch (error) {
      toast.error(
        (error as Error)?.message ?? t("localAccess.readStatusError"),
      );
    }
  }, [baseUrl, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      if (!baseUrl) return;

      if (enabled && !configured) {
        setDialogMode("set");
        return;
      }

      setToggleLoading(true);
      try {
        const response = await fetch(
          `${baseUrl}/local-auth/toggle-external-access`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled }),
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (payload?.error === "local_only") {
            throw new Error(t("localAccess.localOnlyError"));
          }
          throw new Error(t("localAccess.saveFailed"));
        }
        setExternalAccessEnabled(enabled);
        toast.success(
          enabled
            ? t("localAccess.externalAccessEnabled")
            : t("localAccess.externalAccessDisabled"),
        );
      } catch (error) {
        toast.error(
          (error as Error)?.message ?? t("localAccess.saveFailed"),
        );
      } finally {
        setToggleLoading(false);
      }
    },
    [baseUrl, configured, t],
  );

  const resetDialog = useCallback(() => {
    setDialogMode(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  const handlePasswordSubmit = useCallback(async () => {
    if (!baseUrl) return;

    if (!newPassword.trim() || newPassword.trim().length < 6) {
      toast.error(t("localAccess.passwordMinLength"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("localAccess.passwordMismatch"));
      return;
    }

    setDialogLoading(true);
    try {
      const setupResponse = await fetch(`${baseUrl}/local-auth/setup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: newPassword.trim(),
          currentPassword:
            dialogMode === "change" ? currentPassword.trim() : undefined,
        }),
      });

      if (!setupResponse.ok) {
        const payload = (await setupResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (payload?.error === "local_auth_invalid") {
          throw new Error(t("localAccess.invalidCurrentPassword"));
        }
        if (payload?.error === "local_only") {
          throw new Error(t("localAccess.localOnlyError"));
        }
        throw new Error(t("localAccess.saveFailed"));
      }

      if (dialogMode === "set") {
        const toggleResponse = await fetch(
          `${baseUrl}/local-auth/toggle-external-access`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          },
        );
        if (!toggleResponse.ok) {
          throw new Error(t("localAccess.saveFailed"));
        }
      }

      toast.success(
        dialogMode === "set"
          ? t("localAccess.passwordSet")
          : t("localAccess.passwordUpdated"),
      );
      resetDialog();
      await loadStatus();
    } catch (error) {
      toast.error(
        (error as Error)?.message ?? t("localAccess.saveFailed"),
      );
    } finally {
      setDialogLoading(false);
    }
  }, [
    baseUrl,
    confirmPassword,
    currentPassword,
    dialogMode,
    loadStatus,
    newPassword,
    resetDialog,
    t,
  ]);

  return (
    <>
          {/* External access toggle */}
          <div className="flex flex-wrap items-center gap-2 py-3">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary">
              <Globe className="h-3 w-3 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {t("localAccess.externalAccess")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("localAccess.externalAccessDesc")}
              </div>
            </div>
            <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
              <div className="origin-right scale-125">
                <Switch
                  checked={externalAccessEnabled}
                  onCheckedChange={(checked) => void handleToggle(checked)}
                  disabled={toggleLoading}
                  aria-label="External access"
                />
              </div>
            </OpenLoafSettingsField>
          </div>

          {/* Change password (only when enabled) */}
          {externalAccessEnabled && (
            <div className="flex flex-wrap items-center gap-2 py-3">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-secondary">
                <KeyRound className="h-3 w-3 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {t("localAccess.accessPassword")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {configured
                    ? `${t("localAccess.configured")}${updatedAt ? ` · ${t("localAccess.updatedAt", { date: updatedAt })}` : ""}`
                    : t("localAccess.notConfigured")}
                </div>
              </div>
              <OpenLoafSettingsField className="w-full sm:w-64 shrink-0 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogMode("change")}
                >
                  {t("localAccess.changePassword")}
                </Button>
              </OpenLoafSettingsField>
            </div>
          )}

      {/* Password dialog */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => !open && resetDialog()}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "set"
                ? t("localAccess.setPasswordTitle")
                : t("localAccess.changePasswordTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialogMode === "change" && (
              <div className="space-y-2">
                <Label htmlFor="current-password">
                  {t("localAccess.currentPassword")}
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("localAccess.currentPasswordPlaceholder")}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">
                {t("localAccess.newPassword")}
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("localAccess.newPasswordPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">
                {t("localAccess.confirmPassword")}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("localAccess.confirmPasswordPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={resetDialog}
              disabled={dialogLoading}
            >
              {tc("cancel")}
            </Button>
            <Button
              onClick={() => void handlePasswordSubmit()}
              disabled={dialogLoading}
            >
              {dialogLoading ? t("localAccess.saving") : tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
