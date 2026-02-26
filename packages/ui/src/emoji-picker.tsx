/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const EmojiMartPicker = dynamic(
  () => import("@emoji-mart/react").then((m) => m.default),
  { ssr: false }
);

type EmojiMartEmoji = {
  native?: string;
};

export type EmojiPickerProps = {
  className?: string;
  onSelect: (emoji: string) => void;
  width?: number | string;
  perLine?: number;
  emojiButtonSize?: number;
  emojiSize?: number;
  searchPosition?: "sticky" | "none";
};

export function EmojiPicker({
  className,
  onSelect,
  width = 352,
  perLine = 9,
  emojiButtonSize = 36,
  emojiSize = 20,
  searchPosition = "sticky",
}: EmojiPickerProps) {
  const { resolvedTheme } = useTheme();
  const [emojiData, setEmojiData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    import("@emoji-mart/data").then((mod) => {
      if (cancelled) return;
      setEmojiData(mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickerTheme = useMemo(() => {
    if (resolvedTheme === "dark") return "dark";
    return "light";
  }, [resolvedTheme]);

  if (!emojiData) {
    return (
      <div className={cn("p-4 text-sm text-muted-foreground", className)}>
        Loading emoji…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "block max-w-full [&>em-emoji-picker]:block [&>em-emoji-picker]:max-w-full [&>em-emoji-picker]:w-full",
        className
      )}
      style={{ width }}
    >
      <EmojiMartPicker
        data={emojiData}
        theme={pickerTheme}
        onEmojiSelect={(emoji: EmojiMartEmoji) => {
          const nextIcon = emoji?.native;
          if (!nextIcon) return;
          onSelect(nextIcon);
        }}
        previewPosition="none"
        skinTonePosition="none"
        searchPosition={searchPosition}
        perLine={perLine}
        emojiButtonSize={emojiButtonSize}
        emojiSize={emojiSize}
        dynamicWidth={false}
      />
    </div>
  );
}

