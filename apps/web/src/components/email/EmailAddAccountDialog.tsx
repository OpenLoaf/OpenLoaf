"use client";

import { ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, Plus, Settings2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@tenas-ai/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@tenas-ai/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Label } from "@tenas-ai/ui/label";
import { Switch } from "@tenas-ai/ui/switch";

import { cn } from "@/lib/utils";
import {
  EMAIL_PROVIDER_PRESETS,
  getProviderById,
} from "./email-provider-presets";
import type { AddDialogState } from "./use-email-page-state";

type EmailAddAccountDialogProps = {
  addDialog: AddDialogState;
};

/** 预设账户类型 */
const ACCOUNT_TYPE_PRESETS = [
  { label: "工作", color: "bg-blue-500" },
  { label: "个人", color: "bg-green-500" },
  { label: "客服", color: "bg-orange-500" },
  { label: "通知", color: "bg-purple-500" },
  { label: "营销", color: "bg-pink-500" },
  { label: "财务", color: "bg-amber-500" },
  { label: "技术", color: "bg-cyan-500" },
  { label: "订阅", color: "bg-slate-500" },
] as const;

function ProviderSelectStep({
  onSelectProvider,
}: {
  onSelectProvider: (providerId: string) => void;
}) {
  return (
    <div className="py-1">
      <div className="space-y-0.5">
        {EMAIL_PROVIDER_PRESETS.map((provider) => {
          const Icon = provider.icon;
          const isCustom = provider.id === "custom";
          return (
            <button
              type="button"
              key={provider.id}
              onClick={() => onSelectProvider(provider.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                "hover:bg-muted/60",
                isCustom && "mt-2 border-t border-border/50 pt-3",
              )}
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-muted/50">
                <Icon className="size-4" />
              </span>
              <span className="flex-1 text-left text-sm font-medium text-foreground/90">
                {provider.name}
              </span>
              <ChevronRight className="size-4 text-muted-foreground/50" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConfigureStep({ addDialog }: { addDialog: AddDialogState }) {
  const isCustomProvider = addDialog.formState.selectedProviderId === "custom";
  const isOAuth = addDialog.formState.authType === "oauth2";
  const [advancedOpen, setAdvancedOpen] = useState(isCustomProvider);
  const [customLabelMode, setCustomLabelMode] = useState(false);
  const [customInputValue, setCustomInputValue] = useState("");
  const currentLabel = addDialog.formState.label;

  // 解析已选中的标签（支持多选，用逗号分隔）
  const selectedLabels = currentLabel
    ? currentLabel.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // 获取自定义标签（非预设的部分）
  const customLabels = selectedLabels.filter(
    (l) => !ACCOUNT_TYPE_PRESETS.some((p) => p.label === l)
  );

  const handleToggleLabel = (label: string) => {
    const isSelected = selectedLabels.includes(label);
    let nextLabels: string[];
    if (isSelected) {
      nextLabels = selectedLabels.filter((l) => l !== label);
    } else {
      nextLabels = [...selectedLabels, label];
    }
    addDialog.setFormState((prev) => ({ ...prev, label: nextLabels.join(", ") }));
  };

  const handleEnableCustomLabel = () => {
    setCustomLabelMode(true);
    setCustomInputValue("");
  };

  const handleCustomLabelConfirm = () => {
    const value = customInputValue.trim();
    if (value && !selectedLabels.includes(value)) {
      const nextLabels = [...selectedLabels, value];
      addDialog.setFormState((prev) => ({ ...prev, label: nextLabels.join(", ") }));
    }
    setCustomLabelMode(false);
    setCustomInputValue("");
  };

  const handleCustomLabelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomLabelConfirm();
    } else if (e.key === "Escape") {
      setCustomLabelMode(false);
      setCustomInputValue("");
    }
  };

  const handleRemoveCustomLabel = (label: string) => {
    const nextLabels = selectedLabels.filter((l) => l !== label);
    addDialog.setFormState((prev) => ({ ...prev, label: nextLabels.join(", ") }));
  };

  const oauthButtonLabel =
    addDialog.formState.oauthProvider === "google"
      ? "使用 Google 账号登录"
      : "使用 Microsoft 账号登录";

  const isGmailProvider = addDialog.formState.selectedProviderId === "gmail";

  return (
    <div className="space-y-4 py-2">
      {/* OAuth 授权区域 */}
      {isOAuth ? (
        <>
          {addDialog.formState.oauthAuthorized ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                已授权{addDialog.formState.oauthEmail ? ` ${addDialog.formState.oauthEmail}` : ""}
              </span>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full text-sm"
              onClick={addDialog.onOAuthLogin}
            >
              {oauthButtonLabel}
            </Button>
          )}
          {/* Gmail 切换到应用专用密码 */}
          {isGmailProvider ? (
            <button
              type="button"
              onClick={addDialog.onSwitchToPassword}
              className="inline-flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
            >
              使用应用专用密码
              <ExternalLink className="size-3" />
            </button>
          ) : null}
        </>
      ) : (
        <>
          {/* 邮箱地址 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground/80">邮箱地址</Label>
            <Input
              value={addDialog.formState.emailAddress}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({
                  ...prev,
                  emailAddress: event.target.value,
                }))
              }
              placeholder="name@example.com"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          {/* 密码/授权码 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-foreground/80">
                {addDialog.selectedProviderPasswordLabel}
              </Label>
              {addDialog.selectedProviderAppPasswordUrl ? (
                <a
                  href={addDialog.selectedProviderAppPasswordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary/70 transition-colors hover:text-primary"
                >
                  如何获取？
                  <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
            <Input
              type="password"
              value={addDialog.formState.password}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder={`输入${addDialog.selectedProviderPasswordLabel}`}
              className="h-9 text-sm"
            />
          </div>

          {/* 高级设置 */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="size-3.5" />
                  服务器配置
                </span>
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    advancedOpen && "rotate-90",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              {/* IMAP */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                  <span className="size-1.5 rounded-full bg-blue-500" />
                  IMAP 收信
                </div>
                <div className="grid grid-cols-[1fr,90px] gap-2">
                  <Input
                    value={addDialog.formState.imapHost}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        imapHost: event.target.value,
                      }))
                    }
                    placeholder="imap.example.com"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    value={addDialog.formState.imapPort}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        imapPort: Number(event.target.value || 0),
                      }))
                    }
                    placeholder="端口"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-muted-foreground">SSL/TLS</span>
                  <Switch
                    checked={addDialog.formState.imapTls}
                    onCheckedChange={(checked) =>
                      addDialog.setFormState((prev) => ({ ...prev, imapTls: checked }))
                    }
                  />
                </div>
              </div>

              {/* SMTP */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
                  <span className="size-1.5 rounded-full bg-green-500" />
                  SMTP 发信
                </div>
                <div className="grid grid-cols-[1fr,90px] gap-2">
                  <Input
                    value={addDialog.formState.smtpHost}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        smtpHost: event.target.value,
                      }))
                    }
                    placeholder="smtp.example.com"
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    value={addDialog.formState.smtpPort}
                    onChange={(event) =>
                      addDialog.setFormState((prev) => ({
                        ...prev,
                        smtpPort: Number(event.target.value || 0),
                      }))
                    }
                    placeholder="端口"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] text-muted-foreground">SSL/TLS</span>
                  <Switch
                    checked={addDialog.formState.smtpTls}
                    onCheckedChange={(checked) =>
                      addDialog.setFormState((prev) => ({ ...prev, smtpTls: checked }))
                    }
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* 账户类型 */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground/80">
          账户类型
          <span className="ml-1 font-normal text-muted-foreground">（可选）</span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCOUNT_TYPE_PRESETS.map((preset) => {
            const isSelected = selectedLabels.includes(preset.label);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleToggleLabel(preset.label)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  isSelected
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className={cn("size-2 rounded-full", preset.color)} />
                {preset.label}
              </button>
            );
          })}
          {/* 已添加的自定义类型 */}
          {customLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => handleRemoveCustomLabel(label)}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-all"
            >
              <span className="size-2 rounded-full bg-background/30" />
              {label}
            </button>
          ))}
          {/* 自定义输入或按钮 */}
          {customLabelMode ? (
            <Input
              value={customInputValue}
              onChange={(event) => setCustomInputValue(event.target.value)}
              onBlur={handleCustomLabelConfirm}
              onKeyDown={handleCustomLabelKeyDown}
              placeholder="输入后回车"
              className="h-7 w-28 text-xs"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={handleEnableCustomLabel}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" />
              自定义
            </button>
          )}
        </div>
      </div>

      {/* 状态提示 */}
      {addDialog.formError ? (
        <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {addDialog.formError}
        </div>
      ) : null}
      {addDialog.testStatus === "ok" ? (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
          连接测试通过，可以保存账号
        </div>
      ) : null}
    </div>
  );
}

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
