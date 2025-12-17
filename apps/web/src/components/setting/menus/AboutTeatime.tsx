"use client";

import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

const ITEMS: Array<{ key: string; label: string }> = [
  { key: "license", label: "用户协议" },
  { key: "privacy", label: "隐私条款" },
  { key: "oss", label: "开源软件申明" },
  { key: "docs", label: "帮助文档" },
  { key: "contact", label: "联系我们" },
  { key: "issues", label: "报告问题" },
];

export function AboutTeatime() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">版本</div>
            <div className="text-xs text-muted-foreground">v0.1.0</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {ITEMS.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              className="w-full justify-between rounded-none px-4 py-3 h-auto"
            >
              <span className="text-sm font-medium">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

