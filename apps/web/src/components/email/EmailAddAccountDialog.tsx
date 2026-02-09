import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";

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

import {
  EMAIL_PROVIDER_PRESETS,
  getProviderById,
} from "./email-provider-presets";
import type { AddDialogState } from "./use-email-page-state";

type EmailAddAccountDialogProps = {
  addDialog: AddDialogState;
};

function ProviderSelectStep({
  onSelectProvider,
}: {
  onSelectProvider: (providerId: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-3 py-4">
      {EMAIL_PROVIDER_PRESETS.map((provider) => {
        const Icon = provider.icon;
        return (
          <button
            type="button"
            key={provider.id}
            onClick={() => onSelectProvider(provider.id)}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary hover:bg-muted/50"
          >
            <Icon className="size-8 text-muted-foreground" />
            <span className="text-xs font-medium">{provider.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function ConfigureStep({ addDialog }: { addDialog: AddDialogState }) {
  const selectedProvider = addDialog.formState.selectedProviderId
    ? getProviderById(addDialog.formState.selectedProviderId)
    : null;
  const isCustomProvider = addDialog.formState.selectedProviderId === "custom";

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label>邮箱地址</Label>
        <Input
          value={addDialog.formState.emailAddress}
          onChange={(event) =>
            addDialog.setFormState((prev) => ({
              ...prev,
              emailAddress: event.target.value,
            }))
          }
          placeholder="name@example.com"
          autoFocus
        />
      </div>

      <div className="grid gap-2">
        <Label>账号名称（可选）</Label>
        <Input
          value={addDialog.formState.label}
          onChange={(event) =>
            addDialog.setFormState((prev) => ({ ...prev, label: event.target.value }))
          }
          placeholder="工作邮箱 / 客服邮箱"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>{addDialog.selectedProviderPasswordLabel}</Label>
          {addDialog.selectedProviderAppPasswordUrl ? (
            <a
              href={addDialog.selectedProviderAppPasswordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              如何获取{addDialog.selectedProviderPasswordLabel}？
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
        />
      </div>

      <Collapsible defaultOpen={isCustomProvider}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
          >
            <ChevronDown className="size-4 transition-transform [[data-state=open]_&]:rotate-180" />
            高级设置
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold text-muted-foreground">IMAP 配置</div>
            <div className="grid gap-2">
              <Label>IMAP 主机</Label>
              <Input
                value={addDialog.formState.imapHost}
                onChange={(event) =>
                  addDialog.setFormState((prev) => ({
                    ...prev,
                    imapHost: event.target.value,
                  }))
                }
                placeholder="imap.example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>IMAP 端口</Label>
                <Input
                  type="number"
                  value={addDialog.formState.imapPort}
                  onChange={(event) =>
                    addDialog.setFormState((prev) => ({
                      ...prev,
                      imapPort: Number(event.target.value || 0),
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <span>IMAP 加密</span>
                <Switch
                  checked={addDialog.formState.imapTls}
                  onCheckedChange={(checked) =>
                    addDialog.setFormState((prev) => ({ ...prev, imapTls: checked }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-xs font-semibold text-muted-foreground">SMTP 配置</div>
            <div className="grid gap-2">
              <Label>SMTP 主机</Label>
              <Input
                value={addDialog.formState.smtpHost}
                onChange={(event) =>
                  addDialog.setFormState((prev) => ({
                    ...prev,
                    smtpHost: event.target.value,
                  }))
                }
                placeholder="smtp.example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>SMTP 端口</Label>
                <Input
                  type="number"
                  value={addDialog.formState.smtpPort}
                  onChange={(event) =>
                    addDialog.setFormState((prev) => ({
                      ...prev,
                      smtpPort: Number(event.target.value || 0),
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
                <span>SMTP 加密</span>
                <Switch
                  checked={addDialog.formState.smtpTls}
                  onCheckedChange={(checked) =>
                    addDialog.setFormState((prev) => ({ ...prev, smtpTls: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {addDialog.formError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {addDialog.formError}
        </div>
      ) : null}
      {addDialog.testStatus === "ok" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          连接测试通过，可以保存账号。
        </div>
      ) : null}
    </div>
  );
}

export function EmailAddAccountDialog({ addDialog }: EmailAddAccountDialogProps) {
  const isSelectStep = addDialog.formState.step === "select-provider";
  const selectedProvider = addDialog.formState.selectedProviderId
    ? getProviderById(addDialog.formState.selectedProviderId)
    : null;

  return (
    <Dialog open={addDialog.addDialogOpen} onOpenChange={addDialog.onAddDialogOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          {isSelectStep ? (
            <>
              <DialogTitle>添加邮箱账号</DialogTitle>
              <DialogDescription>选择邮箱服务商，自动填充配置。</DialogDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addDialog.onBackToProviderSelect}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <DialogTitle>{selectedProvider?.name ?? "配置邮箱"}</DialogTitle>
              </div>
              <DialogDescription>
                填写邮箱地址与{addDialog.selectedProviderPasswordLabel}进行连接。
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {isSelectStep ? (
          <ProviderSelectStep onSelectProvider={addDialog.onSelectProvider} />
        ) : (
          <ConfigureStep addDialog={addDialog} />
        )}

        {!isSelectStep ? (
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={addDialog.onTestConnection}
              disabled={addDialog.testStatus === "checking"}
            >
              {addDialog.testStatus === "checking" ? "测试中..." : "测试连接"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => addDialog.onAddDialogOpenChange(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={addDialog.onAddAccount}
              disabled={addDialog.addAccountPending}
            >
              {addDialog.addAccountPending ? "保存中..." : "保存账号"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
