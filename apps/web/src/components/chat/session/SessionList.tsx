"use client";

import * as React from "react";
import SessionItem, { type Session } from "./SessionItem";
import { Separator } from "@/components/ui/separator";
import * as ScrollArea from "@radix-ui/react-scroll-area";

interface SessionListProps {
  sessions?: Session[];
  onSelect?: (session: Session) => void;
  onMenuOpenChange?: (open: boolean) => void;
  className?: string;
}

const mockSessions: Session[] = (() => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const d = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();
  return [
    { id: "p1", name: "产品需求讨论", pinned: true, hasLayers: true, createdAt: d(40) },
    { id: "t1", name: "写周报", createdAt: d(0) },
    { id: "t2", name: "调试登录问题", createdAt: d(0) },
    { id: "y1", name: "会议纪要", hasLayers: true, createdAt: d(1) },
    { id: "w1", name: "旅行计划", createdAt: d(3) },
    { id: "w2", name: "代码评审", hasLayers: true, createdAt: d(6) },
    { id: "m1", name: "性能优化", createdAt: d(14) },
    { id: "m2", name: "接口设计", createdAt: d(21) },
    { id: "o1", name: "读书笔记", createdAt: d(65) },
    {
      id: "o2",
      name: "年度总结",
      createdAt: new Date(now - 400 * day).toISOString(),
    },
  ];
})();

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupSessions(sessions: Session[]) {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const oneDay = 24 * 60 * 60 * 1000;

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const pinned: Session[] = [];
  const today: Session[] = [];
  const yesterday: Session[] = [];
  const within7: Session[] = [];
  const within30: Session[] = [];
  const byMonth = new Map<string, Session[]>();

  for (const s of sorted) {
    if (s.pinned) {
      pinned.push(s);
      continue;
    }
    const t = new Date(s.createdAt);
    const diffDays = Math.floor(
      (todayStart - startOfDay(t).getTime()) / oneDay
    );
    if (diffDays === 0) today.push(s);
    else if (diffDays === 1) yesterday.push(s);
    else if (diffDays < 7) within7.push(s);
    else if (diffDays < 30) within30.push(s);
    else {
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(
        2,
        "0"
      )}`;
      const list = byMonth.get(key) ?? [];
      list.push(s);
      byMonth.set(key, list);
    }
  }

  const groups: { key: string; label: string; sessions: Session[] }[] = [];
  if (pinned.length)
    groups.push({ key: "pinned", label: "置顶", sessions: pinned });
  if (today.length)
    groups.push({ key: "today", label: "今日", sessions: today });
  if (yesterday.length)
    groups.push({ key: "yesterday", label: "昨日", sessions: yesterday });
  if (within7.length)
    groups.push({ key: "within7", label: "7天内", sessions: within7 });
  if (within30.length)
    groups.push({ key: "within30", label: "30天内", sessions: within30 });

  for (const [key, list] of byMonth) {
    groups.push({ key, label: key, sessions: list });
  }

  return groups;
}

export default function SessionList({
  sessions = mockSessions,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionListProps) {
  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <ScrollArea.Root
      className={`w-full ${className ?? ""}`}
    >
      <ScrollArea.Viewport className="w-full max-h-[min(80svh,var(--radix-popover-content-available-height))] touch-auto">
        <div className="flex flex-col gap-2">
          {groups.map((g, idx) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="px-2 text-xs font-medium text-muted-foreground">
                {g.label}
              </div>
              {g.sessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  onSelect={onSelect}
                  onMenuOpenChange={onMenuOpenChange}
                />
              ))}
              {idx < groups.length - 1 && <Separator className="my-1" />}
            </div>
          ))}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  );
}
