/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@openloaf/ui/button";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  icons?: LucideIcon[];
  actions?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icons = [],
  actions,
  action,
  className,
}: EmptyStateProps) {
  const [iconA, iconB, iconC] = icons;

  return (
    <div
      className={cn(
        "bg-background border-border hover:border-border/80 text-center",
        "border-2 border-dashed rounded-xl p-14 w-full max-w-[620px]",
        "group transition duration-500",
        className
      )}
    >
      <div className="flex justify-center isolate">
        {icons.length === 3 ? (
          <>
            <div className="bg-background size-12 grid place-items-center rounded-xl relative left-2.5 top-1.5 -rotate-6 shadow-lg ring-1 ring-border group-hover:-translate-x-5 group-hover:-rotate-12 group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
              {iconA &&
                React.createElement(iconA, {
                  className: "w-6 h-6 text-muted-foreground",
                })}
            </div>
            <div className="bg-background size-12 grid place-items-center rounded-xl relative z-10 shadow-lg ring-1 ring-border group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
              {iconB &&
                React.createElement(iconB, {
                  className: "w-6 h-6 text-muted-foreground",
                })}
            </div>
            <div className="bg-background size-12 grid place-items-center rounded-xl relative right-2.5 top-1.5 rotate-6 shadow-lg ring-1 ring-border group-hover:translate-x-5 group-hover:rotate-12 group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
              {iconC &&
                React.createElement(iconC, {
                  className: "w-6 h-6 text-muted-foreground",
                })}
            </div>
          </>
        ) : (
          <div className="bg-background size-12 grid place-items-center rounded-xl shadow-lg ring-1 ring-border group-hover:-translate-y-0.5 transition duration-500 group-hover:duration-200">
            {iconA &&
              React.createElement(iconA, {
                className: "w-6 h-6 text-muted-foreground",
              })}
          </div>
        )}
      </div>
      <h2 className="text-foreground font-medium mt-6">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
        {description}
      </p>
      {actions ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          {actions}
        </div>
      ) : action ? (
        <Button
          onClick={action.onClick}
          variant="outline"
          className={cn("mt-4", "shadow-sm active:shadow-none")}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
