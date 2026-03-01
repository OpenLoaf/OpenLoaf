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

import React from "react";
import { useTranslation } from "react-i18next";
import { useChatOptions } from "../context";
import {
  ClipboardList,
  Code2,
  FileText,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const ICON_ORDER = [Sparkles, ClipboardList, Code2, FileText];
const COLORS = ["text-amber-500", "text-sky-500", "text-emerald-500", "text-violet-500"];

export default function MessageHelper({ compact }: { compact?: boolean } = {}) {
  const { setInput } = useChatOptions();
  const { t } = useTranslation('ai');

  // Build suggestions from translation data
  const rawSuggestions = t('helper.suggestions', { returnObjects: true }) as Array<{
    label: string;
    value: string;
  }> | null;

  const SUGGESTIONS = rawSuggestions
    ? rawSuggestions.map((item, index) => ({
        label: item.label,
        value: item.value,
        icon: ICON_ORDER[index] || Sparkles,
        color: COLORS[index] || "text-blue-500",
      }))
    : [];
  const [hoveredIndex, setHoveredIndex] = React.useState(-1);

  const focusChatInput = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-openloaf-chat-input="true"]'
      );
      if (!el) return;
      el.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  return (
    <div className={cn("flex flex-col items-center", compact ? "gap-2" : "h-full justify-center")}>
      {/* 推荐内容 - ExpandableDockTabs pill 风格 */}
      <div className={cn("mx-auto flex w-full items-center gap-2", compact ? "max-w-2xl flex-row flex-wrap justify-center" : "max-w-md flex-col")}>
        {!compact && (
          <p className="mb-1 text-center text-xs text-muted-foreground">
            {t('helper.tryAskMe')}
          </p>
        )}
        <motion.div
          className={cn("flex items-center gap-1.5", compact ? "flex-row flex-wrap justify-center" : "flex-col")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.3 }}
        >
          {SUGGESTIONS.map((item, index) => {
            const Icon = item.icon;
            const isSelected = hoveredIndex === index;
            return (
              <motion.button
                key={item.label}
                type="button"
                onClick={() => {
                  setInput(item.value);
                  focusChatInput();
                }}
                onPointerEnter={() => setHoveredIndex(index)}
                onPointerLeave={() => setHoveredIndex(-1)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-muted/80 hover:border-border",
                  isSelected
                    ? "border-border bg-muted text-foreground dark:border-border"
                    : "border-border/60 bg-background text-secondary-foreground dark:border-border/40"
                )}
                initial={{
                  opacity: 0,
                  y: 16,
                  scale: 0.8,
                  filter: "blur(4px)",
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                }}
                transition={{
                  delay:
                    0.3 + (SUGGESTIONS.length - 1 - index) * 0.06,
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Icon size={14} className={item.color} />
                {item.label}
              </motion.button>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
