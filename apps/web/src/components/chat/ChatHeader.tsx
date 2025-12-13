"use client"

import { cn } from "@/lib/utils";
import { PlusCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SessionList from "@/components/chat/session/SessionList";
import * as React from "react";
import { useChatContext } from "./ChatProvider";

interface ChatHeaderProps {
  className?: string;
}

export default function ChatHeader({ className }: ChatHeaderProps) {
  const { id: activeSessionId, newSession, selectSession, messages } =
    useChatContext();
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const menuLockRef = React.useRef(false);

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) setHistoryOpen(true);
  };

  return (
    <div className={cn("flex items-center justify-between px-2 py-0", className)}>
      <div className="text-lg font-semibold">Chat</div>
      <div className="flex items-center gap-1">
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="New Session"
            onClick={() => {
              setHistoryOpen(false);
              menuLockRef.current = false;
              newSession();
            }}
          >
            <PlusCircle size={20} />
          </Button>
        )}
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="History"
            >
              <History size={20} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="flex w-64 max-h-[min(80svh,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-2"
            collisionPadding={12}
            sideOffset={6}
            onInteractOutside={(e) => {
              if (menuLockRef.current) e.preventDefault();
            }}
          >
            <SessionList
              activeSessionId={activeSessionId}
              onMenuOpenChange={handleMenuOpenChange}
              onSelect={(session) => {
                // 选中历史会话后：关闭弹层 + 切换会话并加载历史
                setHistoryOpen(false);
                menuLockRef.current = false;
                selectSession(session.id);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
