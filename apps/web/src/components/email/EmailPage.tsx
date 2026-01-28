"use client";

export default function EmailPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            邮箱
          </div>
          <div className="text-xs text-muted-foreground">已连接 2 个邮箱</div>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span className="rounded-md border border-border bg-background px-2 py-1">
              收件箱
            </span>
            <span className="rounded-md border border-border bg-background px-2 py-1">
              已发送
            </span>
            <span className="rounded-md border border-border bg-background px-2 py-1">
              归档
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button className="rounded-md border border-border bg-background px-2 py-1">
            新建
          </button>
          <button className="rounded-md border border-border bg-background px-2 py-1">
            回复
          </button>
          <button className="rounded-md border border-border bg-background px-2 py-1">
            归档
          </button>
          <div className="rounded-md border border-border bg-background px-2 py-1 text-muted-foreground">
            搜索
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="flex w-full min-w-0 flex-col gap-3 border-b border-border bg-card p-3 text-sm lg:w-56 lg:border-b-0 lg:border-r">
          <button className="rounded-md border border-border bg-background px-2 py-1 text-left text-xs font-semibold">
            邮箱
          </button>
          <div className="space-y-1">
            {[
              { title: "工作邮箱", count: 12 },
              { title: "产品反馈", count: 6 },
              { title: "订阅与资讯", count: 28 },
              { title: "归档", count: 120 },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-muted-foreground"
              >
                <span>{item.title}</span>
                <span className="text-xs">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="text-xs font-semibold text-muted-foreground">
            智能邮箱
          </div>
          <div className="space-y-1">
            {[
              { title: "收件箱", count: 24, active: true },
              { title: "VIP", count: 3, active: false },
              { title: "跟进", count: 8, active: false },
              { title: "未读", count: 5, active: false },
            ].map((item) => (
              <div
                key={item.title}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                  item.active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span>{item.title}</span>
                <span className="text-xs">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            新建邮箱规则
          </div>
        </aside>

        <section className="flex w-full min-w-0 flex-col border-b border-border bg-background p-3 lg:w-80 lg:border-b-0 lg:border-r">
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
            搜索邮件
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>今天</span>
            <span>12 封</span>
          </div>
          <div className="mt-2 flex-1 space-y-2 overflow-auto pr-1 text-sm">
            {[
              {
                title: "客户：资料补充与需求澄清",
                from: "Sharon · Kalmia",
                time: "09:20",
                active: true,
                preview: "附上了最新的资料清单与资源链接...",
              },
              {
                title: "【周报】AI 收集箱方向",
                from: "Team Ops",
                time: "08:42",
                active: false,
                preview: "本周目标是完善素材归档流程...",
              },
              {
                title: "素材请求：品牌字库&视觉",
                from: "Design Guild",
                time: "昨天",
                active: false,
                preview: "需要在周五前提供字体授权说明...",
              },
              {
                title: "会议纪要：增长策略",
                from: "Growth",
                time: "昨天",
                active: false,
                preview: "重点关注渠道投放与内容回收...",
              },
            ].map((mail) => (
              <div
                key={mail.title}
                className={`rounded-lg border border-border p-2 ${
                  mail.active ? "bg-muted/40" : "bg-background"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{mail.from}</span>
                  <span>{mail.time}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{mail.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {mail.preview}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-card">
          <div className="border-b border-border bg-background px-4 py-3">
            <div className="text-xs text-muted-foreground">选中邮件</div>
            <div className="text-base font-semibold">
              客户：资料补充与需求澄清
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Sharon · Kalmia</span>
              <span>今天 09:20</span>
              <span>已标记为待整理</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
            <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="text-sm font-semibold">邮件内容</div>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <div className="break-words">
                    Hi 团队，补充了需求的最新清单与文件链接。
                  </div>
                  <div className="break-words">
                    重点包含时间节点、素材格式与审核流程说明。
                  </div>
                  <div className="break-words">
                    附件已同步到共享盘，晚些会再补充说明。
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="text-sm font-semibold">邮件摘要</div>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    需要补齐品牌素材包
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    更新后的需求清单在附件
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    预计周五前完成
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-sm font-semibold">相关附件</div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="rounded-md border border-border bg-background px-2 py-1">
                  需求清单_v2.xlsx
                </div>
                <div className="rounded-md border border-border bg-background px-2 py-1">
                  brand-assets.zip
                </div>
                <div className="rounded-md border border-border bg-background px-2 py-1">
                  时间节点说明.md
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
