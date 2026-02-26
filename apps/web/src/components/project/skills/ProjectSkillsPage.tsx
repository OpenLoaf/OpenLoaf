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

import { memo } from "react";
import { SkillsSettingsPanel } from "@/components/setting/skills/SkillsSettingsPanel";

type ProjectSkillsHeaderProps = {
  isLoading: boolean;
  pageTitle: string;
};

/** Project skills header. */
export const ProjectSkillsHeader = memo(function ProjectSkillsHeader({
  isLoading,
  pageTitle,
}: ProjectSkillsHeaderProps) {
  if (isLoading) return null;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">技能</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

type ProjectSkillsPageProps = {
  projectId?: string;
};

/** Project skills page. */
function ProjectSkillsPage({ projectId }: ProjectSkillsPageProps) {
  return (
    <div className="h-full w-full overflow-auto p-2">
      <SkillsSettingsPanel projectId={projectId} />
    </div>
  );
}

export default ProjectSkillsPage;
