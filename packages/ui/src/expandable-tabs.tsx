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

import * as React from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@openloaf/ui/tooltip";

/** Single tab definition. */
interface Tab {
  title: string;
  icon: LucideIcon;
  type?: "tab";
}

/** Visual separator definition. */
interface Separator {
  type: "separator";
  title?: undefined;
  icon?: undefined;
}

type TabItem = Tab | Separator;

interface ExpandableTabsProps {
  tabs: TabItem[];
  className?: string;
  activeColor?: string;
  /** Tabs 尺寸。 */
  size?: "sm" | "md" | "lg";
  /** Tabs 外观风格。 */
  variant?: "default" | "dock";
  onChange?: (index: number | null) => void;
  selectedIndex?: number | null;
  defaultSelectedIndex?: number | null;
  /** Tooltip content renderer for tabs. */
  getTooltip?: (tab: Tab, index: number) => React.ReactNode;
}

// 按钮动画配置
const buttonVariants = {
  initial: {
    gap: 0,
    paddingLeft: ".5rem",
    paddingRight: ".5rem",
  },
  animate: (isSelected: boolean) => ({
    gap: isSelected ? ".5rem" : 0,
    paddingLeft: isSelected ? "1rem" : ".5rem",
    paddingRight: isSelected ? "1rem" : ".5rem",
  }),
};

// 文本展开动画配置
const spanVariants = {
  initial: { width: 0, opacity: 0 },
  animate: { width: "auto", opacity: 1 },
  exit: { width: 0, opacity: 0 },
};

const transition: Transition = { delay: 0.1, type: "spring", bounce: 0, duration: 0.6 };

/** Expandable tabs with optional controlled selection. */
export function ExpandableTabs({
  tabs,
  className,
  activeColor = "text-primary",
  size = "md",
  variant = "default",
  onChange,
  selectedIndex,
  defaultSelectedIndex = null,
  getTooltip,
}: ExpandableTabsProps) {
  const [uncontrolledSelected, setUncontrolledSelected] = React.useState<
    number | null
  >(defaultSelectedIndex);
  const outsideClickRef = React.useRef<HTMLDivElement>(null!);
  const isControlled = selectedIndex !== undefined;
  const selected = isControlled ? selectedIndex : uncontrolledSelected;

  // 点击外部时重置选中态
  useOnClickOutside(outsideClickRef, () => {
    if (!isControlled) {
      setUncontrolledSelected(null);
    }
    onChange?.(null);
  });

  /** Handle tab selection. */
  const handleSelect = (index: number) => {
    if (!isControlled) {
      setUncontrolledSelected(index);
    }
    onChange?.(index);
  };

  /** Render separator element. */
  const Separator = () => (
    <div className="mx-1 h-[24px] w-[1.2px] bg-border" aria-hidden="true" />
  );

  // 中文注释：集中管理尺寸差异，避免散落在 className 中。
  const sizeConfig = {
    sm: {
      container: "h-8 p-1 gap-1",
      button: "h-6 text-xs",
      icon: 14,
    },
    md: {
      container: "h-9 p-[3px] gap-2",
      button: "h-7 text-sm",
      icon: 16,
    },
    lg: {
      container: "gap-2 px-3 py-1",
      button: "h-9 text-[15px]",
      icon: 18,
    },
  } as const;
  const sizeToken = sizeConfig[size];
  const variantConfig = {
    default: {
      container: "rounded-lg border bg-background",
      button: "rounded-md",
      selected: "bg-muted",
      unselected: "text-muted-foreground hover:bg-muted hover:text-foreground",
    },
    dock: {
      container:
        "rounded-full border border-border/60 bg-background/90 shadow-[0_16px_40px_rgba(0,0,0,0.2)] backdrop-blur",
      button: "rounded-full",
      selected: "bg-background text-foreground shadow-sm",
      unselected:
        "text-muted-foreground/80 hover:bg-background/80 hover:text-foreground",
    },
  } as const;
  const variantToken = variantConfig[variant];

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        "flex flex-wrap items-center",
        sizeToken.container,
        variantToken.container,
        className
      )}
    >
      {tabs.map((tab, index) => {
        if (tab.type === "separator") {
          return <Separator key={`separator-${index}`} />;
        }

        const Icon = tab.icon;
        const isSelected = selected === index;

        const tooltipContent = getTooltip?.(tab, index);
        const button = (
          <motion.button
            key={tab.title}
            variants={buttonVariants}
            initial={false}
            animate="animate"
            custom={isSelected}
            onClick={() => handleSelect(index)}
            transition={transition}
            className={cn(
              "relative flex items-center px-3 py-1 font-medium transition-colors duration-300",
              sizeToken.button,
              variantToken.button,
              isSelected
                ? cn(variantToken.selected, activeColor)
                : variantToken.unselected
            )}
          >
            <Icon size={sizeToken.icon} />
            <AnimatePresence initial={false}>
              {isSelected && (
                <motion.span
                  variants={spanVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={transition}
                  className="overflow-hidden whitespace-nowrap"
                >
                  {tab.title}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );

        // 有提示内容时包裹 Tooltip
        if (!tooltipContent) {
          return button;
        }

        return (
          <Tooltip key={tab.title}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {tooltipContent}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
