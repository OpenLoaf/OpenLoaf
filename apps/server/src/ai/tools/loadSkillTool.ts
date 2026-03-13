/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { tool, zodSchema } from "ai";
import { loadSkillToolDef } from "@openloaf/api/types/tools/skill";
import { SkillSelector } from "@/ai/tools/SkillSelector";
import { getProjectId, getRequestContext } from "@/ai/shared/context/requestContext";
import { getProjectRootPath } from "@openloaf/api/services/vfsService";
import { getOpenLoafRootDir } from "@openloaf/config";
import { resolveParentProjectRootPaths } from "@/ai/shared/util";

/**
 * Load a skill's full content by name.
 * Returns the SKILL.md content along with the base path for resolving relative paths.
 */
export const loadSkillTool = tool({
  description: loadSkillToolDef.description,
  inputSchema: zodSchema(loadSkillToolDef.parameters),
  execute: async ({ skillName }) => {
    const projectId = getProjectId();
    const projectRoot = projectId
      ? getProjectRootPath(projectId) ?? undefined
      : undefined;
    const globalRoot = getOpenLoafRootDir();
    const parentRoots = await resolveParentProjectRootPaths(projectId);

    const match = await SkillSelector.resolveSkillByName(skillName, {
      projectRoot,
      parentRoots,
      globalRoot,
    });

    if (!match) {
      return {
        ok: false,
        error: `未找到名为 "${skillName}" 的技能。请检查技能名称是否正确（参考 Skills 列表摘要中的 name 字段）。`,
      };
    }

    const basePath = path.dirname(match.path);

    return {
      ok: true,
      data: {
        skillName: match.name,
        scope: match.scope,
        basePath,
        content: match.content,
        hint: `技能目录中的相对路径（如 scripts/extract.sh）均相对于 basePath: ${basePath}，请拼接后使用。`,
      },
    };
  },
});
