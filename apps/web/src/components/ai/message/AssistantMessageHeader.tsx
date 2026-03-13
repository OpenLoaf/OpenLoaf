"use client";

import * as React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@openloaf/ui/avatar";

interface AssistantMessageHeaderProps {
  /** Assistant message used to resolve agent display metadata. */
  message?: UIMessage | null;
  className?: string;
}

/** Resolve assistant label from message agent metadata with product fallback. */
function resolveAssistantDisplayName(message: UIMessage | null | undefined, fallbackName: string) {
  const agent = ((message as any)?.agent ?? (message as any)?.metadata?.agent) as
    | { id?: string; kind?: string; name?: string }
    | undefined;
  const agentId = typeof agent?.id === "string" ? agent.id.trim().toLowerCase() : "";
  const agentKind = typeof agent?.kind === "string" ? agent.kind.trim().toLowerCase() : "";
  const agentName = typeof agent?.name === "string" ? agent.name.trim() : "";
  // 逻辑：主代理对用户统一显示产品级名称，避免暴露内部类名如 MasterAgent。
  if (agentKind === "master" || agentId === "master" || /^master(agent)?$/i.test(agentName)) {
    return fallbackName;
  }
  return agentName || fallbackName;
}

/** Resolve assistant avatar url from message metadata when available. */
function resolveAssistantAvatarUrl(message: UIMessage | null | undefined) {
  const agent = ((message as any)?.agent ?? (message as any)?.metadata?.agent) as
    | { avatarUrl?: string }
    | undefined;
  const avatarUrl = typeof agent?.avatarUrl === "string" ? agent.avatarUrl.trim() : "";
  return avatarUrl || undefined;
}

export default function AssistantMessageHeader({
  message,
  className,
}: AssistantMessageHeaderProps) {
  const { t } = useTranslation("ai");
  const displayName = React.useMemo(
    () => resolveAssistantDisplayName(message, t("dock.aiAssistant")),
    [message, t]
  );
  const avatarUrl = React.useMemo(() => resolveAssistantAvatarUrl(message), [message]);

  return (
    <div className={cn("flex items-center gap-2 px-1", className)}>
      <Avatar className="size-6 ring-1 ring-border/60">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
        <AvatarFallback className="bg-ol-purple/10 text-ol-purple">
          <Sparkles className="size-3.5" />
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-[11px] font-medium text-muted-foreground">
        {displayName}
      </span>
    </div>
  );
}
