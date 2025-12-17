"use client";

import { Button } from "@/components/ui/button";
import { SettingsGroup } from "./SettingsGroup";

export function AccountSettings() {
  // UI only: no business logic yet.
  const isLoggedIn = false;

  return (
    <div className="space-y-6">
      <SettingsGroup title="登录">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">当前登录信息</div>
            <div className="text-xs text-muted-foreground">
              {isLoggedIn ? "已登录" : "未登录"}
              {isLoggedIn ? " · user@example.com" : ""}
            </div>
          </div>

          <div className="flex items-center">
            <Button variant="outline" size="sm">
              登录
            </Button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="详情">
        <div className="divide-y divide-border">
          <div className="py-3 text-xs text-muted-foreground">
            用户名：{isLoggedIn ? "示例用户" : "—"}
          </div>
          <div className="py-3 text-xs text-muted-foreground">
            邮箱：{isLoggedIn ? "user@example.com" : "—"}
          </div>
          <div className="py-3 text-xs text-muted-foreground">
            登录方式：{isLoggedIn ? "OAuth" : "—"}
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
}
