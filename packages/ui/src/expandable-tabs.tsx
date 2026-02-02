"use client";

import * as React from "react";
import { AnimatePresence, motion, type Transition } from "framer-motion";
import { useOnClickOutside } from "usehooks-ts";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@tenas-ai/ui/tooltip";

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

  return (
    <div
      ref={outsideClickRef}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border bg-background p-[3px] h-9",
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
              "relative flex items-center rounded-md px-3 py-1 text-sm font-medium transition-colors duration-300 h-7",
              isSelected
                ? cn("bg-muted", activeColor)
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon size={16} />
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
