"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTabs } from "@/hooks/use-tabs";
import { KeyRound, Boxes, SlidersHorizontal, User, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { BasicSettings } from "./menus/BasicSettings";
import { AccountSettings } from "./menus/AccountSettings";
import { AboutTeatime } from "./menus/AboutTeatime";
import { KeyManagement } from "./menus/KeyManagement";
import { ModelManagement } from "./menus/ModelManagement";

type SettingsMenuKey = "basic" | "account" | "about" | "models" | "keys";

const MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> = [
  { key: "basic", label: "基础设置", Icon: SlidersHorizontal, Component: BasicSettings },
  { key: "account", label: "账户管理", Icon: User, Component: AccountSettings },
  { key: "models", label: "模型管理", Icon: Boxes, Component: ModelManagement },
  { key: "keys", label: "密钥管理", Icon: KeyRound, Component: KeyManagement },
  { key: "about", label: "关于Teatime", Icon: Info, Component: AboutTeatime },
];

export default function SettingsPage({
  panelKey: _panelKey,
  tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>("basic");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const setTabMinLeftWidth = useTabs((s) => s.setTabMinLeftWidth);

  useEffect(() => {
    setTabMinLeftWidth(tabId, 500);
    return () => setTabMinLeftWidth(tabId, undefined);
  }, [tabId, setTabMinLeftWidth]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCollapsed(entry.contentRect.width < 700);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const ActiveComponent = useMemo(
    () => MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey],
  );

  const menuGroups = useMemo(() => {
    const byKey = new Map(MENU.map((item) => [item.key, item]));
    return [
      [byKey.get("basic"), byKey.get("account")].filter(Boolean),
      [byKey.get("models"), byKey.get("keys")].filter(Boolean),
      [byKey.get("about")].filter(Boolean),
    ] as Array<typeof MENU>;
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-background"
    >
      <div className="flex h-full min-h-0">
        <motion.div
          animate={{ width: isCollapsed ? 60 : 192 }}
          initial={false}
          className="shrink-0 border-r border-border bg-muted/20"
        >
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {menuGroups.map((group, groupIndex) => (
                <div key={`group_${groupIndex}`} className="space-y-2">
                  {group.map((item) => {
                    const active = item.key === activeKey;
                    const Icon = item.Icon;
                    return (
                      <Tooltip key={item.key} delayDuration={0}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={active ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "w-full h-9",
                              isCollapsed
                                ? "justify-center px-0"
                                : "justify-start",
                              active && "text-foreground",
                            )}
                            onClick={() => setActiveKey(item.key)}
                          >
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                !isCollapsed && "mr-2",
                              )}
                            />
                            {!isCollapsed && item.label}
                          </Button>
                        </TooltipTrigger>
                        {isCollapsed && (
                          <TooltipContent side="right">
                            {item.label}
                          </TooltipContent>
                        )}
                      </Tooltip>
                    );
                  })}

                  {groupIndex < menuGroups.length - 1 ? (
                    <Separator
                      className={cn(
                        "my-3",
                        isCollapsed ? "mx-2" : "mx-1",
                      )}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </ScrollArea>
        </motion.div>

        <div className="min-w-[400px] flex-1">
          <ScrollArea className="h-full">
            <div className="p-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <ActiveComponent />
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
