"use client";

import { Sparkles, Terminal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Render a quick actions widget (MVP placeholder). */
export default function QuickActionsWidget() {
  return (
    <div className="flex h-full w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
        >
          <Search className="size-4" />
          Search
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-11 justify-start gap-2"
        >
          <Terminal className="size-4" />
          Terminal
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="col-span-2 h-11 justify-start gap-2"
        >
          <Sparkles className="size-4" />
          Ask AI
        </Button>
      </div>
    </div>
  );
}
