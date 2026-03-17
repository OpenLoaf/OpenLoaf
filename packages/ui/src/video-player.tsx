/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";

type VideoPlayerProps = {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  controls?: boolean;
  /** Optional VTT URL for timeline thumbnails (currently unused). */
  thumbnails?: string;
  title?: string;
  /** Optional clip start time in seconds. */
  clipStartTime?: number;
  /** Optional clip end time in seconds. */
  clipEndTime?: number;
  /** Kept for API compat, unused. */
  smallLayoutWhen?: boolean;
  className?: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Render an HTML5 video player with HLS support and custom controls. */
export function VideoPlayer({
  src,
  poster,
  autoPlay,
  muted: mutedProp,
  controls = true,
  title,
  clipStartTime,
  clipEndTime,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import("hls.js").default | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(mutedProp ?? false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [ready, setReady] = useState(false);
  const [buffered, setBuffered] = useState(0);

  const effectiveEnd = clipEndTime && clipEndTime > 0 ? clipEndTime : duration;

  // HLS setup
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Native HLS (Safari)
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    let cancelled = false;
    import("hls.js").then((mod) => {
      if (cancelled) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) {
        video.src = src;
        return;
      }
      const hls = new Hls({
        startLevel: -1,
        capLevelToPlayerSize: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
    });

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src]);

  // Clip enforcement via timeupdate
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      const t = video.currentTime;
      setCurrentTime(t);
      if (clipEndTime && clipEndTime > 0 && t >= clipEndTime) {
        video.pause();
        video.currentTime = clipStartTime ?? 0;
      }

      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setReady(true);
      if (clipStartTime && clipStartTime > 0) {
        video.currentTime = clipStartTime;
      }
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onDurationChange = () => setDuration(video.duration);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("durationchange", onDurationChange);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("durationchange", onDurationChange);
    };
  }, [clipStartTime, clipEndTime]);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      resetHideTimer();
    }
  }, [playing, resetHideTimer]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (clipStartTime && video.currentTime < clipStartTime) {
        video.currentTime = clipStartTime;
      }
      video.play();
    } else {
      video.pause();
    }
  }, [clipStartTime]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const v = Number.parseFloat(e.target.value);
    video.volume = v;
    setVolume(v);
    if (v > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      const bar = progressRef.current;
      if (!video || !bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const start = clipStartTime ?? 0;
      const end = clipEndTime && clipEndTime > 0 ? clipEndTime : duration;
      const newTime = start + ratio * (end - start);
      video.currentTime = newTime;
    },
    [duration, clipStartTime, clipEndTime],
  );

  const progress =
    effectiveEnd > (clipStartTime ?? 0)
      ? ((currentTime - (clipStartTime ?? 0)) / (effectiveEnd - (clipStartTime ?? 0))) * 100
      : 0;

  const bufferedProgress =
    effectiveEnd > (clipStartTime ?? 0)
      ? ((buffered - (clipStartTime ?? 0)) / (effectiveEnd - (clipStartTime ?? 0))) * 100
      : 0;

  const displayTime = currentTime - (clipStartTime ?? 0);
  const displayDuration = effectiveEnd - (clipStartTime ?? 0);

  if (!controls) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg bg-black", className)}>
        <video
          ref={videoRef}
          poster={poster}
          autoPlay={autoPlay}
          muted={mutedProp}
          playsInline
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/player relative overflow-hidden rounded-lg bg-black",
        className,
      )}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (playing) setShowControls(false);
      }}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        poster={poster}
        autoPlay={autoPlay}
        muted={isMuted}
        playsInline
        className="h-full w-full cursor-pointer object-contain"
        onClick={togglePlay}
      />

      {/* Loading placeholder */}
      {!ready && poster ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={poster}
            alt={title ?? "Video thumbnail"}
            className="absolute inset-0 h-full w-full object-contain"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-background/60" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex aspect-square h-[18%] min-h-8 items-center justify-center rounded-md border border-border bg-background/70 text-foreground">
              <Play className="h-[55%] w-[55%] min-h-4 min-w-4 translate-x-[0.5px]" />
            </span>
          </div>
        </div>
      ) : null}

      {/* Center play button (paused) */}
      {ready && !playing ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center"
          onClick={togglePlay}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform hover:scale-110">
            <Play className="h-6 w-6 translate-x-0.5" />
          </span>
        </button>
      ) : null}

      {/* Controls overlay */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300",
          showControls ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className="group/progress mb-2 flex h-1 w-full cursor-pointer items-center"
          onClick={handleProgressClick}
        >
          <div className="relative h-1 w-full rounded-full bg-white/20 transition-[height] group-hover/progress:h-1.5">
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/30"
              style={{ width: `${Math.min(100, Math.max(0, bufferedProgress))}%` }}
            />
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-sm transition-opacity group-hover/progress:opacity-100"
              style={{ left: `${Math.min(100, Math.max(0, progress))}%`, marginLeft: "-6px" }}
            />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 text-white">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/20"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-0.5" />
            )}
          </button>

          {/* Volume */}
          <div className="group/vol flex items-center gap-1">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/20"
              onClick={toggleMute}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="hidden h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/30 accent-white group-hover/vol:block [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
          </div>

          {/* Time */}
          <span className="ml-1 select-none text-xs tabular-nums text-white/80">
            {formatTime(Math.max(0, displayTime))}
            {" / "}
            {formatTime(Math.max(0, displayDuration))}
          </span>

          <div className="flex-1" />

          {/* Fullscreen */}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/20"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
