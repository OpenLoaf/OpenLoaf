"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MaskedImageProps {
  /** Base image src. */
  baseSrc: string;
  /** Optional mask src. */
  maskSrc?: string;
  /** Image alt text. */
  alt?: string;
  /** Whether the base image is draggable. */
  draggable?: boolean;
  /** Drag start handler for the base image. */
  onDragStart?: React.DragEventHandler<HTMLImageElement>;
  /** Class name for the base image. */
  className?: string;
  /** Class name for the container. */
  containerClassName?: string;
  /** Class name for the mask image. */
  maskClassName?: string;
}

/** Render an image with an optional mask overlay. */
export default function MaskedImage({
  baseSrc,
  maskSrc,
  alt,
  draggable,
  onDragStart,
  className,
  containerClassName,
  maskClassName,
}: MaskedImageProps) {
  return (
    <div className={cn("relative", containerClassName)}>
      <img
        src={baseSrc}
        alt={alt}
        className={className}
        draggable={draggable}
        onDragStart={onDragStart}
      />
      {maskSrc ? (
        <img
          src={maskSrc}
          alt={alt ? `${alt} mask` : "mask"}
          className={cn("pointer-events-none absolute inset-0", maskClassName)}
        />
      ) : null}
    </div>
  );
}
