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
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { getCachedAccessToken } from "@/lib/saas-auth";

type SuggestionItem = {
  label: string;
  value: string;
  icon: typeof Sparkles;
  color: string;
};

const ICON_ORDER = [Sparkles, ClipboardList, Code2, FileText];
const COLORS = ["text-ol-amber", "text-ol-blue", "text-ol-green", "text-ol-purple"];

export default function MessageHelper({
  compact,
  projectId,
}: { compact?: boolean; projectId?: string } = {}) {
  const { setInput } = useChatOptions();
  const { t } = useTranslation('ai');

  // Build static suggestions from translation data (fallback)
  const rawSuggestions = t('helper.suggestions', { returnObjects: true }) as Array<{
    label: string;
    value: string;
  }> | null;

  const staticSuggestions: SuggestionItem[] = rawSuggestions
    ? rawSuggestions.map((item, index) => ({
        label: item.label,
        value: item.value,
        icon: ICON_ORDER[index] || Sparkles,
        color: COLORS[index] || "text-ol-blue",
      }))
    : [];

  // Dynamic suggestions from auxiliary model
  const dynamicMutation = useMutation(
    trpc.settings.generateChatSuggestions.mutationOptions(),
  );

  const lastRequestedKeyRef = React.useRef<string>("");
  React.useEffect(() => {
    const key = projectId || "__global__";
    if (lastRequestedKeyRef.current === key) return;
    lastRequestedKeyRef.current = key;
    dynamicMutation.mutate({ projectId: projectId || undefined, saasAccessToken: getCachedAccessToken() ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 缓存上一次的有效建议，加载期间保持不变避免布局弹跳
  const prevSuggestionsRef = React.useRef<SuggestionItem[]>(staticSuggestions);
  const SUGGESTIONS: SuggestionItem[] = React.useMemo(() => {
    const dynamic = dynamicMutation.data?.suggestions;
    if (dynamic && dynamic.length > 0) {
      const result = dynamic.map((item: { label: string; value: string }, index: number) => ({
        label: item.label,
        value: item.value,
        icon: ICON_ORDER[index % ICON_ORDER.length] || Sparkles,
        color: COLORS[index % COLORS.length] || "text-ol-blue",
      }));
      prevSuggestionsRef.current = result;
      return result;
    }
    // 加载中时保留上一次的建议，而非回退到静态建议
    if (dynamicMutation.isPending) {
      return prevSuggestionsRef.current;
    }
    prevSuggestionsRef.current = staticSuggestions;
    return staticSuggestions;
  }, [dynamicMutation.data, dynamicMutation.isPending, staticSuggestions]);

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
    <div className={cn("flex flex-col items-center", compact ? "min-h-[2rem] gap-2" : "h-full justify-center")}>
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
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-muted/80 hover:border-border",
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
