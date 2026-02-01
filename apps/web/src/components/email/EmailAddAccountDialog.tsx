import { Button } from "@tenas-ai/ui/button";
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
import type { AddDialogState } from "./use-email-page-state";

type EmailAddAccountDialogProps = {
  addDialog: AddDialogState;
};

export function EmailAddAccountDialog({ addDialog }: EmailAddAccountDialogProps) {
  return (
    <Dialog open={addDialog.addDialogOpen} onOpenChange={addDialog.onAddDialogOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加邮箱账号</DialogTitle>
          <DialogDescription>填写 IMAP/SMTP 与应用专用密码进行连接。</DialogDescription>
        </DialogHeader>
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
              placeholder="name@company.com"
            />
          </div>
          <div className="grid gap-2">
            <Label>账号名称</Label>
            <Input
              value={addDialog.formState.label}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="工作邮箱 / 客服邮箱"
            />
          </div>
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

          <div className="grid gap-2">
            <Label>应用专用密码</Label>
            <Input
              type="password"
              value={addDialog.formState.password}
              onChange={(event) =>
                addDialog.setFormState((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="输入应用专用密码"
            />
          </div>

          {addDialog.formError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {addDialog.formError}
            </div>
          ) : null}
          {addDialog.testStatus === "ok" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              连接测试通过，可以保存账号。
            </div>
          ) : null}
        </div>
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
          <Button type="button" onClick={addDialog.onAddAccount} disabled={addDialog.addAccountPending}>
            {addDialog.addAccountPending ? "保存中..." : "保存账号"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
