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

import { motion } from "framer-motion";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label?: ReactNode;
}

interface AnimatedTabsProps<T extends Tab> {
  tabs: T[];
  value?: string;
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  onValueChange?: (tabId: string) => void;
  renderTab?: (tab: T, isActive: boolean) => ReactNode;
  getTabProps?: (
    tab: T,
    isActive: boolean
  ) => ComponentPropsWithRef<"button">;
  wrapTab?: (tab: T, button: ReactNode, isActive: boolean) => ReactNode;
  className?: string;
  tabClassName?: string;
  tabActiveClassName?: string;
  tabInactiveClassName?: string;
  bubbleClassName?: string;
  labelClassName?: string;
  layoutId?: string;
}

export function AnimatedTabs<T extends Tab>({
  tabs,
  value,
  defaultTab,
  onChange,
  onValueChange,
  renderTab,
  getTabProps,
  wrapTab,
  className,
  tabClassName,
  tabActiveClassName,
  tabInactiveClassName,
  bubbleClassName,
  labelClassName,
  layoutId = "bubble",
}: AnimatedTabsProps<T>) {
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultTab || tabs[0]?.id || ""
  );
  const isControlled = value !== undefined;
  const activeTab = isControlled ? value : uncontrolledValue;
  const normalizedActiveTab = useMemo(() => {
    if (!activeTab && tabs.length > 0) return tabs[0]!.id;
    return activeTab;
  }, [activeTab, tabs]);

  /** Handle tab changes from UI. */
  const handleTabChange = (tabId: string) => {
    if (!isControlled) {
      setUncontrolledValue(tabId);
    }
    onChange?.(tabId);
    onValueChange?.(tabId);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div role="tablist" className={cn("flex items-center gap-1", className)}>
      {tabs.map((tab) => {
        const isActive = normalizedActiveTab === tab.id;
        const tabProps = getTabProps?.(tab, isActive);
        const content = renderTab ? renderTab(tab, isActive) : tab.label ?? tab.id;
        const button = (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={(event) => {
              tabProps?.onClick?.(event);
              if (event.defaultPrevented) return;
              handleTabChange(tab.id);
            }}
            {...tabProps}
            className={cn(
              "relative rounded-[--radius] outline-ring transition focus-visible:outline-2 [&>*:not([data-tab-bubble])]:relative [&>*:not([data-tab-bubble])]:z-10",
              tabClassName,
              isActive ? tabActiveClassName : tabInactiveClassName,
              tabProps?.className
            )}
            style={{
              WebkitTapHighlightColor: "transparent",
              ...tabProps?.style,
            }}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                data-tab-bubble="true"
                className={cn(
                  "absolute inset-0 z-0 bg-white dark:bg-foreground/20 mix-blend-normal",
                  bubbleClassName
                )}
                style={{ borderRadius: "inherit" }}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            {renderTab ? (
              content
            ) : (
              <span className={cn("relative z-10", labelClassName)}>
                {content}
              </span>
            )}
          </button>
        );
        const wrapped = wrapTab ? wrapTab(tab, button, isActive) : button;
        return <Fragment key={tab.id}>{wrapped}</Fragment>;
      })}
    </div>
  );
}
