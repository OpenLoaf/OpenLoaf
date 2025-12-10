"use client"

import { cn } from "@/lib/utils";
import { PlusCircle, History } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatHeaderProps {
  className?: string;
}

export default function ChatHeader({ className }: ChatHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between px-2 py-0", className)}>
      <div className="text-lg font-semibold">Chat</div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon">
          <PlusCircle size={20} />
        </Button>
        <Button variant="ghost" size="icon">
          <History size={20} />
        </Button>
      </div>
    </div>
  );
}