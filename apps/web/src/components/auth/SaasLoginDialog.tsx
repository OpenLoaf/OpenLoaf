"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
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
    loginStatus,
    loginError,
    startLogin,
    cancelLogin,
  } = useSaasAuth();

  const isBusy = loginStatus === "opening" || loginStatus === "polling";
  const subtitleText =
    loginStatus === "opening"
      ? "正在打开系统浏览器…"
      : loginStatus === "polling"
        ? "等待登录完成…"
        : loginStatus === "error"
          ? loginError ?? "登录失败，请重试"
          : "连接你的云端账号";

  /** Handle dialog open state changes. */
  const handleOpenChange = (nextOpen: boolean) => {
    // 关键逻辑：关闭弹窗时需要取消轮询，避免遗留状态。
    if (!nextOpen) {
      cancelLogin();
    }
    onOpenChange(nextOpen);
  };

  /** Begin the SaaS login flow for provider. */
  const handleLogin = async (provider: SaasLoginProvider) => {
    // 关键流程：点击按钮后保持弹窗开启，执行 OAuth 跳转与轮询。
    onOpenChange(true);
    await startLogin(provider);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[440px]">
        <DialogHeader className="sr-only">
          <DialogTitle>登录云端账号</DialogTitle>
          <DialogDescription>选择登录方式并继续</DialogDescription>
        </DialogHeader>
        <div className="bg-card text-card-foreground">
          <div className="space-y-2 px-8 pt-8 pb-6 text-center">
            <h1 className="text-[1.9rem] font-semibold leading-tight tracking-tight">
              欢迎使用 Tenas
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
          </div>

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
        </div>
      </DialogContent>
    </Dialog>
  );
}
