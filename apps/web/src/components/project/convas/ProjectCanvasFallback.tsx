"use client";

import { Skeleton } from "@/components/ui/skeleton";

/** Render fallback content while the canvas bundle loads. */
export default function ProjectCanvasFallback() {
  return <Skeleton className="h-full w-full min-h-[480px]" />;
}
