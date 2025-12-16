"use client";

import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { KeyRound, Boxes, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { BasicSettings } from "./menus/BasicSettings";
import { KeyManagement } from "./menus/KeyManagement";
import { ModelManagement } from "./menus/ModelManagement";

type SettingsMenuKey = "basic" | "models" | "keys";

const MENU: Array<{
  key: SettingsMenuKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  Component: ComponentType;
}> = [
  { key: "basic", label: "基础设置", Icon: SlidersHorizontal, Component: BasicSettings },
  { key: "models", label: "模型管理", Icon: Boxes, Component: ModelManagement },
  { key: "keys", label: "密钥管理", Icon: KeyRound, Component: KeyManagement },
];

export default function SettingsPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  const [activeKey, setActiveKey] = useState<SettingsMenuKey>("basic");

  const ActiveComponent = useMemo(
    () => MENU.find((item) => item.key === activeKey)?.Component ?? (() => null),
    [activeKey],
  );

  return (
    <div className="h-full w-full min-h-0 min-w-0 overflow-hidden bg-background">
      <div className="flex h-full min-h-0">
        <div className="w-48 shrink-0 border-r border-border bg-muted/20">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {MENU.map((item) => {
                const active = item.key === activeKey;
                const Icon = item.Icon;
                return (
                  <Button
                    key={item.key}
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "w-full justify-start h-9",
                      active && "text-foreground",
                    )}
                    onClick={() => setActiveKey(item.key)}
                  >
                    <Icon className="mr-2 h-4 w-4 shrink-0" />
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <div className="min-w-0 flex-1">
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
