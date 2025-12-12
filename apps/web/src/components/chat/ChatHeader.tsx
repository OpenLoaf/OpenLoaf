"use client"

import { cn } from "@/lib/utils";
import { PlusCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SessionList from "@/components/chat/session/SessionList";
import * as React from "react";

interface ChatHeaderProps {
  className?: string;
}

export default function ChatHeader({ className }: ChatHeaderProps) {
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);
  const hoveringRef = React.useRef(false);
  const menuLockRef = React.useRef(false);

  const openHistory = () => {
    hoveringRef.current = true;
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHistoryOpen(true);
  };
  const scheduleClose = () => {
    hoveringRef.current = false;
    if (menuLockRef.current) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHistoryOpen(false), 160);
  };

  const handleMenuOpenChange = (open: boolean) => {
    menuLockRef.current = open;
    if (open) {
      if (closeTimer.current) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setHistoryOpen(true);
    } else if (!hoveringRef.current) {
      setHistoryOpen(false);
    }
  };

  return (
    <div className={cn("flex items-center justify-between px-2 py-0", className)}>
      <div className="text-lg font-semibold">Chat</div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon">
          <PlusCircle size={20} />
        </Button>
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onMouseEnter={openHistory}
              onMouseLeave={scheduleClose}
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
            onMouseEnter={openHistory}
            onMouseLeave={scheduleClose}
          >
            <SessionList onMenuOpenChange={handleMenuOpenChange} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
