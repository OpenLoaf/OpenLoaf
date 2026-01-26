"use client";

import * as React from "react";
import SessionItem, { type Session } from "./SessionItem";
import { Separator } from "@tenas-ai/ui/separator";
import { useChatSessions } from "@/hooks/use-chat-sessions";

interface SessionListProps {
  /** Current tab id for scoping. */
  tabId?: string;
  /** Current active session id. */
  activeSessionId?: string;
  /** Select handler. */
  onSelect?: (session: Session) => void;
  /** Menu open state callback. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Custom className. */
  className?: string;
}

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

type SessionDisplayNameInput = {
  /** Session title. */
  title: string;
  /** Project id bound to session. */
  projectId: string | null;
  /** Project name resolved from tree. */
  projectName: string | null;
  /** Current project id for scoping. */
  currentProjectId?: string;
};

/** Build display name with project prefix when needed. */
function buildSessionDisplayName(input: SessionDisplayNameInput): string {
  const title = input.title.trim();
  if (!input.currentProjectId) return title;
  if (!input.projectId || input.projectId === input.currentProjectId) return title;
  const projectName = String(input.projectName ?? "").trim();
  if (!projectName) return title;
  // 非当前项目会话在标题前拼接项目名。
  return title ? `${projectName} / ${title}` : projectName;
}

export default function SessionList({
  tabId,
  activeSessionId,
  onSelect,
  onMenuOpenChange,
  className,
}: SessionListProps) {
  const { sessions: chatSessions, isLoading, scopeProjectId } = useChatSessions({ tabId });
  const sessions: Session[] = React.useMemo(() => {
    const showProjectLabel = !scopeProjectId;
    return chatSessions.map((s) => ({
      id: s.id,
      name: s.title,
      displayName: buildSessionDisplayName({
        title: s.title,
        projectId: s.projectId,
        projectName: s.projectName,
        currentProjectId: scopeProjectId,
      }),
      // 逻辑：未绑定项目的 tab 才展示项目名称标签。
      projectLabel: showProjectLabel
        ? String(s.projectName ?? "").trim() || undefined
        : undefined,
      createdAt: s.createdAt,
      pinned: s.isPin,
    }));
  }, [chatSessions, scopeProjectId]);

  const groups = React.useMemo(() => groupSessions(sessions), [sessions]);

  return (
    <div
      className={`w-full max-h-[min(80svh,var(--radix-popover-content-available-height))] overflow-auto show-scrollbar touch-auto ${className ?? ""}`}
    >
      {isLoading ? null : sessions.length === 0 ? (
        <div className="px-2 py-3 text-sm text-muted-foreground">
          暂无会话
        </div>
      ) : (
        <div className="flex flex-col gap-2 [&>div]:!block [&>div]:!max-w-full [&>div]:!w-full">
          {groups.map((g, idx) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="px-2 text-xs font-medium text-muted-foreground">
                {g.label}
              </div>
              {g.sessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={Boolean(activeSessionId && s.id === activeSessionId)}
                  onSelect={onSelect}
                  onMenuOpenChange={onMenuOpenChange}
                />
              ))}
              {idx < groups.length - 1 && <Separator className="my-1" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
