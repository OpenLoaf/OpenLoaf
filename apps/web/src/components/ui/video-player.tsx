"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import type { PlayerSrc } from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

type VideoPlayerProps = {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  /** Optional VTT URL for timeline thumbnails. */
  thumbnails?: string;
  title?: string;
  className?: string;
};

/** Render a Vidstack player with the official default layout. */
export function VideoPlayer({
  src,
  poster,
  autoPlay,
  muted,
  controls = true,
  thumbnails,
  title,
  className,
}: VideoPlayerProps) {
  const [isHlsReady, setIsHlsReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as Window & { Hls?: unknown }).Hls);
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const target = window as Window & { Hls?: unknown };
    if (target.Hls) {
      setIsHlsReady(true);
      return undefined;
    }
    let cancelled = false;
    import("hls.js")
      .then((mod) => {
        if (cancelled) return;
        target.Hls = mod.default;
        setIsHlsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsHlsReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mediaSrc = useMemo(
    () =>
      ({
        src,
        type: "application/vnd.apple.mpegurl",
      }) as PlayerSrc,
    [src],
  );

  if (!isHlsReady) {
    return (
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-muted/40",
          className
        )}
      >
        {poster ? (
          <>
            <img
              src={poster}
              alt={title ?? "Video thumbnail"}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-background/60" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-[18%] min-h-8 aspect-square items-center justify-center rounded-full border border-border bg-background/70 text-foreground">
                <Play className="h-[55%] w-[55%] min-h-4 min-w-4 translate-x-[0.5px]" />
              </span>
            </div>
          </>
        ) : null}
        <div className="relative z-10 text-sm text-muted-foreground">正在加载播放器...</div>
      </div>
    );
  }

  return (
    <MediaPlayer
      title={title}
      src={mediaSrc}
      poster={poster}
      autoPlay={autoPlay}
      muted={muted}
      className={cn("vds-video-layout w-full h-full", className)}
    >
      <MediaProvider />
      {controls ? (
        <>
          <DefaultVideoLayout
            icons={defaultLayoutIcons}
            thumbnails={thumbnails}
            slots={{
              title: null,
              chapterTitle: null,
              googleCastButton: null,
              smallLayout: {
                title: null,
                chapterTitle: null,
                googleCastButton: null,
              },
              largeLayout: {
                title: null,
                chapterTitle: null,
                googleCastButton: null,
              },
            }}
          />
        </>
      ) : null}
    </MediaPlayer>
  );
}
