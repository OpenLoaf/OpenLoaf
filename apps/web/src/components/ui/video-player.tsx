"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaPlayer, MediaProvider } from "@vidstack/react";
import {
  defaultLayoutIcons,
  DefaultVideoLayout,
} from "@vidstack/react/player/layouts/default";
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
    () => ({
      src,
      type: "application/vnd.apple.mpegurl",
    }),
    [src],
  );

  if (!isHlsReady) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center", className)}>
        正在加载播放器...
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
