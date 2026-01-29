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
          <div className="mt-2 flex-1 divide-y divide-border overflow-auto pr-1 text-sm">
            {[
              {
                title: "客户：资料补充与需求澄清",
                from: "Sharon · Kalmia",
                time: "09:20",
                unread: true,
                preview: "附上了最新的资料清单与资源链接...",
              },
              {
                title: "【周报】AI 收集箱方向",
                from: "Team Ops",
                time: "08:42",
                unread: false,
                preview: "本周目标是完善素材归档流程...",
              },
              {
                title: "素材请求：品牌字库&视觉",
                from: "Design Guild",
                time: "昨天",
                unread: true,
                preview: "需要在周五前提供字体授权说明...",
              },
              {
                title: "会议纪要：增长策略",
                from: "Growth",
                time: "昨天",
                unread: false,
                preview: "重点关注渠道投放与内容回收...",
              },
            ].map((mail) => (
              <div key={mail.title} className="py-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {mail.unread ? (
                      <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-transparent" />
                    )}
                    <span>{mail.from}</span>
                  </div>
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
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                客户：资料补充与需求澄清
              </span>
              <span>Sharon · Kalmia</span>
              <span>今天 09:20</span>
              <span>已标记为待整理</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-auto">
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">收件人</div>
              <div className="mt-1 text-sm font-medium">
                Tenas Studio · 产品组
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                抄送：Design Guild，Growth
              </div>
            </div>
            <div className="border-b border-border px-4 py-4 text-sm leading-6 text-foreground">
              <p className="break-words">
                Hi 团队，补充了需求的最新清单与文件链接，具体包括素材格式、审核流程以及时间节点。
              </p>
              <p className="mt-3 break-words">
                关键项已在附件里标注，今晚会同步共享盘权限，明天补充详细说明。
              </p>
              <p className="mt-3 break-words">
                如需提前确认，请直接回复或在评论区留言。
              </p>
            </div>
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">附件</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
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
            <div className="border-b border-border px-4 py-3">
              <div className="text-xs text-muted-foreground">快速操作</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button className="rounded-md border border-border bg-background px-2 py-1">
                  回复
                </button>
                <button className="rounded-md border border-border bg-background px-2 py-1">
                  转发
                </button>
                <button className="rounded-md border border-border bg-background px-2 py-1">
                  标记完成
                </button>
                <button className="rounded-md border border-border bg-background px-2 py-1">
                  加入素材
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
