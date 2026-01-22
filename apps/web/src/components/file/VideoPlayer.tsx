"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

export interface VideoPlayerProps {
  /** HLS manifest URL. */
  src?: string;
  /** Optional poster image. */
  poster?: string;
  /** Whether to autoplay. */
  autoPlay?: boolean;
  /** Whether to show native controls. */
  controls?: boolean;
  /** Mute audio by default. */
  muted?: boolean;
  /** Optional class name for styling. */
  className?: string;
  /** Error handler when playback fails. */
  onError?: (error: unknown) => void;
}

function canPlayNativeHls(video: HTMLVideoElement) {
  return Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
}

/** Render a video element backed by hls.js when needed. */
export default function VideoPlayer({
  src,
  poster,
  autoPlay,
  controls = true,
  muted,
  className,
  onError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!src) {
      video.removeAttribute("src");
      video.load();
      return;
    }

    if (canPlayNativeHls(video)) {
      // 逻辑：Safari 等原生支持 HLS 时直接赋值。
      video.src = src;
      return;
    }

    if (!Hls.isSupported()) {
      // 逻辑：浏览器不支持 hls.js 时回退到原生播放。
      video.src = src;
      return;
    }

    const hls = new Hls({ enableWorker: true });
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(src);
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal && onError) onError(data);
    });

    return () => {
      hls.destroy();
    };
  }, [onError, src]);

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster}
      autoPlay={autoPlay}
      controls={controls}
      muted={muted}
      playsInline
    />
  );
}
