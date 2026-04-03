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

import { SkillsSettingsPanel } from "@/components/setting/skills/SkillsSettingsPanel";

/** Skill settings page — renders project-scoped when projectId is provided. */
export function SkillSettings({ projectId }: { projectId?: string }) {
  return <SkillsSettingsPanel projectId={projectId} />;
}
