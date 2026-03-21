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

import * as React from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { cn } from "@/lib/utils";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import type { SaasLoginProvider } from "@/lib/saas-auth";

type SaasLoginDialogProps = {
  /** Whether dialog is open. */
  open: boolean;
  /** Update dialog open state. */
  onOpenChange: (open: boolean) => void;
};

/** SaasLoginDialog renders the SaaS login modal content. */
export function SaasLoginDialog({ open, onOpenChange }: SaasLoginDialogProps) {
  const { t } = useTranslation('common');
  // Login status from SaaS auth store.
  const {
    loggedIn,
    loginStatus,
    loginError,
    startLogin,
    cancelLogin,
  } = useSaasAuth();
  // 当前登录入口，用于展示对应 icon。
  const [selectedProvider, setSelectedProvider] = React.useState<SaasLoginProvider | null>(null);
  // 关闭动画期间的状态。
  const [isClosing, setIsClosing] = React.useState(false);
  // 关闭动画清理计时器。
  const closeTimerRef = React.useRef<number | null>(null);
  // 记录上一次 open，用于检测外部关闭。
  const wasOpenRef = React.useRef(open);

  const isBusy = loginStatus === "opening" || loginStatus === "polling";
  const isClosingAfterLogin = open && loggedIn && selectedProvider !== null && loginStatus === "idle";
  const isLoginInProgress = isBusy || isClosingAfterLogin;
  const providerMeta =
    selectedProvider === "google"
      ? { src: "/icons/google.png", alt: "Google" }
      : selectedProvider === "wechat"
        ? { src: "/icons/wechat.png", alt: "WeChat" }
        : null;
  const subtitleText =
    isClosingAfterLogin
      ? t('login.subtitleSuccess')
      : loginStatus === "opening"
        ? t('login.subtitleOpening')
        : loginStatus === "polling"
          ? t('login.subtitlePolling')
          : loginStatus === "error"
            ? loginError ?? t('login.subtitleError')
            : t('login.subtitleDefault');

  /** Handle dialog open state changes. */
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    const wasOpen = wasOpenRef.current;
    if (open) {
      // 规范：多步骤 Dialog 在打开时重置状态，避免关闭动画期间闪回。
      clearCloseTimer();
      setIsClosing(false);
      cancelLogin();
      setSelectedProvider(null);
    } else if (wasOpen) {
      // 关闭时停止轮询，避免后台持续请求 login-code。
      cancelLogin();
      // 关闭动画期间保持当前 UI 不变，仅延迟清除 isClosing 标记。
      setIsClosing(true);
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsClosing(false);
        closeTimerRef.current = null;
      }, 200);
    }
    wasOpenRef.current = open;
  }, [open, cancelLogin, clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  // 登录成功后自动关闭弹窗。
  React.useEffect(() => {
    if (isClosingAfterLogin) {
      const timer = window.setTimeout(() => {
        onOpenChange(false);
      }, 800);
      return () => window.clearTimeout(timer);
    }
  }, [isClosingAfterLogin, onOpenChange]);

  /** Begin the SaaS login flow for provider. */
  const handleLogin = async (provider: SaasLoginProvider) => {
    // 关键流程：点击按钮后保持弹窗开启，执行 OAuth 跳转与轮询。
    onOpenChange(true);
    setSelectedProvider(provider);
    await startLogin(provider);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-[440px]"
        onInteractOutside={(event) => {
          // 关键逻辑：登录中禁止点击空白处关闭弹窗。
          if (isLoginInProgress) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          // 关键逻辑：登录中禁止使用 ESC 关闭弹窗。
          if (isLoginInProgress) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('login.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('login.dialogDesc')}</DialogDescription>
        </DialogHeader>
        <div className="bg-card text-card-foreground">
          <div className="space-y-2 px-8 pt-10 pb-6 text-center">
              {isLoginInProgress && providerMeta ? (
                <div className="flex justify-center pb-2">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted/40">
                    <img
                      src={providerMeta.src}
                      alt={providerMeta.alt}
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                  </span>
                </div>
              ) : (
                <div className="flex justify-center pb-2">
                  <img
                    src="/logo_nobody.png"
                    alt="OpenLoaf"
                    className="h-16 w-16 object-contain"
                  />
                </div>
              )}
              <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">
                {isLoginInProgress
                  ? <span className="sr-only">{t('login.welcome')}</span>
                  : t('login.welcome')
                }
              </h1>
              <p
                className={cn(
                  "text-sm",
                  loginStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {subtitleText}
              </p>
          </div>

          <div className="space-y-4 px-8 pb-6">
            {isLoginInProgress ? (
              <div className="space-y-3">
                {isClosingAfterLogin ? null : (
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-3xl border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
                      "hover:bg-muted/60",
                    )}
                    onClick={() => {
                      onOpenChange(false);
                    }}
                  >
                    {t('login.cancelLogin')}
                  </button>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleLogin("google")}
                  disabled={isBusy}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-3xl border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
                    "hover:bg-muted/60",
                    isBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <img
                      src="/icons/google.png"
                      alt="Google"
                      width={20}
                      height={20}
                      className="h-5 w-5 object-contain"
                    />
                  </span>
                  <span>{t('login.loginWithGoogle')}</span>
                </button>

                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-xs text-muted-foreground">{t('login.orDivider')}</span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <button
                  type="button"
                  onClick={() => void handleLogin("wechat")}
                  disabled={isBusy}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-3xl border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
                    "hover:bg-muted/60",
                    isBusy && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <img
                      src="/icons/wechat.png"
                      alt="WeChat"
                      width={20}
                      height={20}
                      className="h-5 w-5 object-contain"
                    />
                  </span>
                  <span>{t('login.loginWithWechat')}</span>
                </button>
              </>
            )}
          </div>

          {!isLoginInProgress && (
            <div className="border-t border-border/60 px-8 py-4 text-xs text-muted-foreground">
              {t('login.agreePrefix')}{" "}
              <Link href="#" className="text-muted-foreground underline transition-colors hover:text-foreground">
                {t('login.msa')}
              </Link>
              {", "}
              <Link href="#" className="text-muted-foreground underline transition-colors hover:text-foreground">
                {t('login.productTerms')}
              </Link>
              {", "}
              <Link href="#" className="text-muted-foreground underline transition-colors hover:text-foreground">
                {t('login.policy')}
              </Link>
              {", "}
              <Link href="#" className="text-muted-foreground underline transition-colors hover:text-foreground">
                {t('login.privacyStatement')}
              </Link>
              {", "}
              <Link href="#" className="text-muted-foreground underline transition-colors hover:text-foreground">
                {t('login.cookieStatement')}
              </Link>
              {t('login.agreeSuffix')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
