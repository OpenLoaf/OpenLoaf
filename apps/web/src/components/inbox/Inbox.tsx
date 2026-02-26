/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

export default function InboxPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">收集箱</div>
          <div className="text-base font-semibold">素材工作台</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border border-border bg-background px-2 py-1">
            24 项素材
          </span>
          <button className="rounded-md border border-border bg-background px-2 py-1">
            导出
          </button>
          <button className="rounded-md border border-border bg-background px-2 py-1">
            新建素材
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.6fr_0.4fr]">
          <div className="flex h-full flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
            <div className="text-sm font-semibold">素材画布</div>
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-border bg-background p-6 text-center text-sm text-muted-foreground">
              <div className="text-base font-medium text-foreground">
                将文件、图片或文字拖入此区域
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                支持拖拽、粘贴、输入
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-background p-2">
                <div className="font-medium text-foreground">最近拖入</div>
                <div className="mt-1 text-muted-foreground">
                  brand-kit.zip · 128MB
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-2">
                <div className="font-medium text-foreground">自动标签</div>
                <div className="mt-1 text-muted-foreground">设计 · 营销 · 客户</div>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col gap-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-sm font-semibold">快速记录</div>
              <textarea
                aria-label="快速记录"
                placeholder="输入或粘贴你的文字，支持 markdown。"
                className="mt-2 h-28 w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/60"
              />
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-sm font-semibold">素材清单</div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                {[
                  "客户邮件摘要",
                  "需求清单 v2",
                  "竞品截图",
                  "会议纪要",
                  "品牌视觉参考",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-md border border-border bg-background px-2 py-1"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-sm font-semibold">流转提示</div>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                  邮件主题已转换为素材卡片
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                  图片可拖拽到任何任务
                </div>
                <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                  支持复制任意文字到素材画布
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
