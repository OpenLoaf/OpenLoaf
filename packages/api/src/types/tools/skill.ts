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
  name: "加载技能",
  description:
    'Loads the full content of a SKILL.md by name. Returns `{ skillName, scope, basePath, content }` — relative paths inside the skill (e.g. `scripts/extract.sh`) must be resolved against `basePath`. Call when you find a relevant skill in the Skills list summary.',
  parameters: z.object({
    skillName: z
      .string()
      .min(1)
      .describe("技能名称，对应 Skills 列表摘要中的 name 字段。"),
  }),
  component: null,
} as const;

export const skillToolMeta = {
  [loadSkillToolDef.id]: { riskType: RiskType.Read },
} as const;
