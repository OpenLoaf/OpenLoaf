"use client";

import { ArrowLeft } from "lucide-react";

import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";

import { getProviderById } from "./email-provider-presets";
import type { AddDialogState } from "./use-email-page-state";
import { ProviderSelectStep } from "./EmailAddAccountProviderStep";
import { ConfigureStep } from "./EmailAddAccountConfigureStep";

type EmailAddAccountDialogProps = {
  addDialog: AddDialogState;
};

export function EmailAddAccountDialog({ addDialog }: EmailAddAccountDialogProps) {
  const isSelectStep = addDialog.formState.step === "select-provider";
  const isOAuth = addDialog.formState.authType === "oauth2";
  const selectedProvider = addDialog.formState.selectedProviderId
    ? getProviderById(addDialog.formState.selectedProviderId)
    : null;

  return (
    <Dialog open={addDialog.addDialogOpen} onOpenChange={addDialog.onAddDialogOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="px-5 pb-0 pt-5">
          {isSelectStep ? (
            <>
              <DialogTitle className="text-base">添加邮箱账号</DialogTitle>
              <DialogDescription className="text-xs">
                选择邮箱服务商以快速配置
              </DialogDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addDialog.onBackToProviderSelect}
                  className="-ml-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <div className="flex items-center gap-2">
                  {selectedProvider ? (
                    <span className="flex size-6 items-center justify-center rounded-lg bg-muted">
                      <selectedProvider.icon className="size-3.5" />
                    </span>
                  ) : null}
                  <DialogTitle className="text-base">
                    {selectedProvider?.name ?? "配置邮箱"}
                  </DialogTitle>
                </div>
              </div>
              <DialogDescription className="text-xs">
                {isOAuth
                  ? "通过 OAuth 授权连接邮箱"
                  : `填写邮箱地址与${addDialog.selectedProviderPasswordLabel}进行连接`}
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {/* Content */}
        <div className="px-5 py-3">
          {isSelectStep ? (
            <ProviderSelectStep onSelectProvider={addDialog.onSelectProvider} />
          ) : (
            <ConfigureStep addDialog={addDialog} />
          )}
        </div>

        {/* Footer */}
        {!isSelectStep ? (
          <DialogFooter className="px-5 pb-5 pt-2">
            <div className="flex w-full items-center justify-between">
              {isOAuth ? (
                <span />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addDialog.onTestConnection}
                  disabled={addDialog.testStatus === "checking"}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  {addDialog.testStatus === "checking" ? "测试中..." : "测试连接"}
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addDialog.onAddDialogOpenChange(false)}
                  className="h-8 text-xs"
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={addDialog.onAddAccount}
                  disabled={addDialog.addAccountPending}
                  className="h-8 text-xs"
                >
                  {addDialog.addAccountPending ? "保存中..." : "保存账号"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
