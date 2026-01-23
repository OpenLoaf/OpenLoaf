"use client";

/** Render a minimal transfer progress bar for Electron drops. */
export default function ProjectFileSystemTransferBar({
  transfer,
  onRetry,
}: {
  /** Current transfer state snapshot. */
  transfer: {
    currentName: string;
    percent: number;
    status: "running" | "failed";
  } | null;
  /** Retry the failed transfer. */
  onRetry: () => void;
}) {
  if (!transfer) return null;
  const percent = Math.max(0, Math.min(100, Math.round(transfer.percent)));
  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col gap-1 rounded-md border border-border/60 bg-background/90 px-3 py-2 text-xs shadow-sm">
      <div className="flex items-center gap-2">
        <span className="max-w-[220px] truncate" title={transfer.currentName}>
          {transfer.currentName || "传输中"}
        </span>
        <span className="tabular-nums text-foreground/70">{percent}%</span>
        {transfer.status === "failed" ? (
          <button
            type="button"
            className="text-xs text-primary transition-colors hover:text-primary/80"
            onClick={onRetry}
          >
            重试
          </button>
        ) : null}
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-foreground/10">
        <div
          className="h-full bg-primary transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
