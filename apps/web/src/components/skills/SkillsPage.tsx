"use client";

import { SkillsSettingsPanel } from "@/components/setting/skills/SkillsSettingsPanel";

export default function SkillsPage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <div className="flex-1 overflow-auto p-3">
        <SkillsSettingsPanel />
      </div>
    </div>
  );
}
