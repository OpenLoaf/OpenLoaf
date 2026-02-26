"use client";

import Image from "next/image";

export function LoadingScreen({ label = "Connecting to server..." }: { label?: string }) {
  return (
    <div className="grid h-svh place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Image
          src="/head_s.png"
          alt="OpenLoaf logo"
          width={40}
          height={40}
          className="h-10 w-10 motion-safe:animate-pulse"
        />
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}
