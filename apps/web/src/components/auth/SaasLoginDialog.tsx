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
  // Login status from SaaS auth store.
  const {
    loggedIn,
    loginStatus,
    loginError,
    wechatLoginUrl,
    startLogin,
    cancelLogin,
  } = useSaasAuth();
  // 当前登录入口，用于展示对应 icon。
  const [selectedProvider, setSelectedProvider] = React.useState<SaasLoginProvider | null>(null);
  // 微信 iframe 是否已加载完成。
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  // 关闭动画期间的状态。
  const [isClosing, setIsClosing] = React.useState(false);
  // 关闭动画清理计时器。
  const closeTimerRef = React.useRef<number | null>(null);
  // 记录上一次 open，用于检测外部关闭。
  const wasOpenRef = React.useRef(open);

  const isBusy = loginStatus === "opening" || loginStatus === "polling";
  const isClosingAfterLogin = open && loggedIn && selectedProvider !== null && loginStatus === "idle";
  const isLoginInProgress = isBusy || isClosingAfterLogin || isClosing;
  const hideHeaderForWechat = isBusy && selectedProvider === "wechat";
  const providerMeta =
    selectedProvider === "google"
      ? { src: "/icons/google.png", alt: "Google" }
      : selectedProvider === "wechat"
        ? { src: "/icons/wechat.png", alt: "WeChat" }
        : null;
  const subtitleText =
    isClosingAfterLogin
      ? "登录成功，正在关闭…"
      : loginStatus === "opening"
      ? selectedProvider === "wechat"
        ? "正在加载微信扫码登录…"
        : "正在打开系统浏览器…"
      : loginStatus === "polling"
        ? "等待登录完成…"
        : loginStatus === "error"
          ? loginError ?? "登录失败，请重试"
          : "连接你的云端账号";

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
      clearCloseTimer();
      setIsClosing(false);
    } else if (wasOpen) {
      // 关闭动画期间保持登录 UI，避免闪现登录按钮。
      setIsClosing(true);
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        setIsClosing(false);
        cancelLogin();
        setSelectedProvider(null);
        closeTimerRef.current = null;
      }, 200);
    }
    wasOpenRef.current = open;
  }, [open, cancelLogin, clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  /** Begin the SaaS login flow for provider. */
  const handleLogin = async (provider: SaasLoginProvider) => {
    // 关键流程：点击按钮后保持弹窗开启，执行 OAuth 跳转与轮询。
    onOpenChange(true);
    setSelectedProvider(provider);
    if (provider === "wechat") setIframeLoaded(false);
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
          <DialogTitle>登录云端账号</DialogTitle>
          <DialogDescription>选择登录方式并继续</DialogDescription>
        </DialogHeader>
        <div className="bg-card text-card-foreground">
          {!hideHeaderForWechat && (
            <div className="space-y-2 px-8 pt-8 pb-6 text-center">
              <h1
                className={cn(
                  "text-[1.9rem] font-semibold leading-tight tracking-tight",
                  isLoginInProgress && "flex justify-center",
                )}
              >
                {isLoginInProgress && providerMeta ? (
                  <>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted/40">
                      <img
                        src={providerMeta.src}
                        alt={providerMeta.alt}
                        width={28}
                        height={28}
                        className="h-7 w-7 object-contain"
                      />
                    </span>
                    <span className="sr-only">欢迎使用 OpenLoaf</span>
                  </>
                ) : (
                  "欢迎使用 OpenLoaf"
                )}
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
          )}

          <div className={cn("space-y-4 px-8 pb-6", isLoginInProgress && selectedProvider === "wechat" && "pt-6")}>
            {isLoginInProgress ? (
              <div className="space-y-3">
                {selectedProvider === "wechat" && !isClosingAfterLogin ? (
                  <div className="relative -mx-8 h-[340px] overflow-hidden" style={{ width: 'calc(100% + 64px)' }}>
                    <div className="absolute left-1/2 h-[340px] w-[540px] -translate-x-1/2 overflow-hidden pt-16">
                      {!iframeLoaded && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
                          <svg
                            className="h-6 w-6 animate-spin text-muted-foreground"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="text-sm text-muted-foreground">正在加载微信扫码…</span>
                        </div>
                      )}
                      <iframe
                        title="wechat-login"
                        src={wechatLoginUrl ?? undefined}
                        scrolling="no"
                        onLoad={() => setIframeLoaded(true)}
                        className={cn(
                          "h-full w-full border-none bg-background",
                          !iframeLoaded && "invisible",
                        )}
                      />
                    </div>
                  </div>
                ) : null}
                {isClosingAfterLogin ? (
                  <div className="py-2 text-center text-sm text-muted-foreground">
                    登录成功，正在关闭…
                  </div>
                ) : (
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
                      "hover:bg-muted/60",
                    )}
                    onClick={() => {
                      onOpenChange(false);
                    }}
                  >
                    取消登录
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
                    "flex w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
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
                  <span>使用 Google 登录</span>
                </button>

                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-xs text-muted-foreground">或</span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>

                <button
                  type="button"
                  onClick={() => void handleLogin("wechat")}
                  disabled={isBusy}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-full border border-border/70 bg-muted/40 px-4 py-3 text-foreground transition-colors",
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
                  <span>使用微信登录</span>
                </button>
              </>
            )}
          </div>

          {!isLoginInProgress && (
            <div className="border-t border-border/60 px-8 py-4 text-xs text-muted-foreground">
              登录即表示你同意{" "}
              <Link
                href="#"
                className="text-muted-foreground underline transition-colors hover:text-foreground"
              >
                MSA
              </Link>
              ，{" "}
              <Link
                href="#"
                className="text-muted-foreground underline transition-colors hover:text-foreground"
              >
                产品条款
              </Link>
              ，{" "}
              <Link
                href="#"
                className="text-muted-foreground underline transition-colors hover:text-foreground"
              >
                政策
              </Link>
              ，{" "}
              <Link
                href="#"
                className="text-muted-foreground underline transition-colors hover:text-foreground"
              >
                隐私声明
              </Link>
              ，以及{" "}
              <Link
                href="#"
                className="text-muted-foreground underline transition-colors hover:text-foreground"
              >
                Cookie 声明
              </Link>
              。
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
