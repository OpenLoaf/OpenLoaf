"use client";

import { Loader } from "@/components/animate-ui/icons/loader";

export function LoadingScreen({ label = "Connecting to server..." }: { label?: string }) {
  return (
    <div className="grid h-svh place-items-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader size={18} />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

