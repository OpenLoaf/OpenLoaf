"use client";

import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TeatimeSettingsMenuItem = {
  key: string;
  label: string;
  Icon?: ComponentType<{ className?: string }>;
};

export type TeatimeSettingsMenuProps = {
  groups: TeatimeSettingsMenuItem[][];
  activeKey: string;
  isCollapsed?: boolean;
  onChange: (key: string) => void;
  renderItemWrapper?: (item: TeatimeSettingsMenuItem, button: ReactNode) => ReactNode;
  className?: string;
};

/** Settings menu list with grouped items. */
export function TeatimeSettingsMenu({
  groups,
  activeKey,
  isCollapsed = false,
  onChange,
  renderItemWrapper,
  className,
}: TeatimeSettingsMenuProps) {
  return (
    <div className={cn("h-full overflow-auto", className)}>
      <div className="p-2 space-y-2 pr-3">
        {groups.map((group, groupIndex) => (
          <div key={`group_${groupIndex}`} className="space-y-2">
            {group.map((item) => {
              const active = item.key === activeKey;
              const Icon = item.Icon;
              const button = (
                <Button
                  key={item.key}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "w-full h-9",
                    isCollapsed ? "justify-center" : "justify-start gap-2 px-3 text-sm",
                  )}
                  onClick={() => onChange(item.key)}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                  {isCollapsed ? null : <span>{item.label}</span>}
                </Button>
              );

              const wrapped = renderItemWrapper ? renderItemWrapper(item, button) : button;
              return <div key={item.key}>{wrapped}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
