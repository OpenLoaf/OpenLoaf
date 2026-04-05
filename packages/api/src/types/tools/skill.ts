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
    '触发：当你在 Skills 列表摘要中发现与用户需求相关的技能时，调用此工具加载完整的技能说明。用途：根据技能名称加载对应 SKILL.md 的完整内容，同时返回技能目录的绝对路径（basePath），用于拼接技能中引用的相对路径资源。返回：{ skillName, scope, basePath, content }。注意：技能内容中的相对路径（如 scripts/extract.sh）均相对于 basePath，请使用 basePath 拼接后再访问。',
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
