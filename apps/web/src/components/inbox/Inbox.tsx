"use client";

export default function InboxPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-border bg-background text-foreground">
      <div className="flex h-12 items-center justify-between border-b border-border bg-muted/30 px-4 text-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            收集箱
          </div>
          <div className="text-xs text-muted-foreground">已连接 2 个邮箱</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
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
        <div className="flex items-center gap-2 text-xs">
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

      <div className="flex h-[calc(100%-48px)]">
        <aside className="flex w-56 flex-col gap-3 border-r border-border bg-card p-3 text-sm">
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
          <div className="pt-2 text-xs font-semibold text-muted-foreground">
            邮箱
          </div>
          <div className="space-y-1">
            {[
              { title: "工作邮箱", count: 12, active: false },
              { title: "产品反馈", count: 6, active: false },
              { title: "订阅与资讯", count: 28, active: false },
              { title: "归档", count: 120, active: false },
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
          <div className="mt-auto rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            新建邮箱规则
          </div>
        </aside>

        <section className="flex w-80 flex-col border-r border-border bg-background p-3">
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

        <section className="flex flex-1 flex-col bg-card">
          <div className="border-b border-border bg-background px-4 py-3">
            <div className="text-xs text-muted-foreground">选中邮件</div>
            <div className="text-base font-semibold">
              客户：资料补充与需求澄清
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>Sharon · Kalmia</span>
              <span>今天 09:20</span>
              <span>已标记为待整理</span>
            </div>
          </div>

          <div className="grid flex-1 grid-rows-[auto_1fr] gap-3 p-4">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="text-sm font-semibold">邮件内容</div>
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <div>Hi 团队，补充了需求的最新清单与文件链接。</div>
                  <div>重点包含时间节点、素材格式与审核流程说明。</div>
                  <div>附件已同步到共享盘，晚些会再补充说明。</div>
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

            <div className="flex flex-1 flex-col gap-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold">素材工作台</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border border-border bg-background px-2 py-1">
                    24 项素材
                  </span>
                  <button className="rounded-md border border-border bg-background px-2 py-1">
                    导出
                  </button>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-3 xl:grid-cols-[1.6fr_0.4fr]">
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
                      <div className="font-medium text-foreground">
                        最近拖入
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        brand-kit.zip · 128MB
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-2">
                      <div className="font-medium text-foreground">自动标签</div>
                      <div className="mt-1 text-muted-foreground">
                        设计 · 营销 · 客户
                      </div>
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
        </section>
      </div>
    </div>
  );
}
