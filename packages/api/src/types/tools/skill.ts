/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from "zod";
import { RiskType } from "../toolResult";

export const loadSkillToolDef = {
  id: "LoadSkill",
  readonly: true,
  name: "Load Skill",
  description:
    "Load the full content of a SKILL.md by name. Returns { skillName, scope, basePath, content } — relative paths inside the skill (e.g. `scripts/extract.sh`) must be resolved against `basePath`. Call when you find a relevant skill in the Skills list summary.",
  parameters: z.object({
    skillName: z
      .string()
      .min(1)
      .describe("Skill name, matching the `name` field in the Skills list summary."),
  }),
  component: null,
} as const;

export const skillToolMeta = {
  [loadSkillToolDef.id]: { riskType: RiskType.Read },
} as const;
