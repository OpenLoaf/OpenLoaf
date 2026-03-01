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
import { useChatOptions } from "../context";
import {
  ClipboardList,
  Code2,
  FileText,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  {
    label: "测试审批",
    value:
      "测试审批：请调用 sub-agent，name 设为 TestApprovalSubAgent，先获取当前时间，再触发 test-approval，并等待我在工具卡片里点击允许/拒绝。",
    icon: Sparkles,
    color: "text-amber-500",
  },
  {
    label: "打开淘宝搜索手机贴膜",
    value: "打开淘宝，搜索手机贴膜，告诉我销售额前三的店铺名称",
    icon: ClipboardList,
    color: "text-sky-500",
  },
  {
    label: "随机创建一个项目",
    value: "帮我随机创建一个测试项目",
    icon: Code2,
    color: "text-emerald-500",
  },
  {
    label: "生成一份本周工作周报",
    value: "帮我生成一份本周工作周报",
    icon: FileText,
    color: "text-violet-500",
  },
];

export default function MessageHelper({ compact }: { compact?: boolean } = {}) {
  const { setInput } = useChatOptions();
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
            你可以试着问我：
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
