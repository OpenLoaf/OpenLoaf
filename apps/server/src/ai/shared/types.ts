/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n
export type SkillSummary = {
  /** Skill id. */
  id: string;
  /** Summary content. */
  summary: string;
};


/** 根据工具 ID 判断需要哪些 preface 章节。 */
export type PrefaceCapabilities = {
  /** 是否需要 Python 运行时章节。 */
  needsPythonRuntime: boolean
  /** 是否需要项目规则章节。 */
  needsProjectRules: boolean
  /** 是否需要文件引用规则章节。 */
  needsFileReferenceRules: boolean
  /** 是否需要可用子 Agent 列表章节。 */
  needsSubAgentList: boolean
  /** 是否需要任务分工规则章节。 */
  needsTaskDelegationRules: boolean
  /** 是否需要 Shell 上下文章节。 */
  needsShellContext: boolean
}

export type PromptContext = {
  /** Workspace snapshot for prompt building. */
  workspace: {
    /** Workspace id. */
    id: string;
    /** Workspace name. */
    name: string;
    /** Workspace root path. */
    rootPath: string;
  };
  /** Project snapshot for prompt building. */
  project: {
    /** Project id. */
    id: string;
    /** Project name. */
    name: string;
    /** Project root path. */
    rootPath: string;
    /** Project rules content. */
    rules: string;
  };
  /** Account snapshot for prompt building. */
  account: {
    /** Account id. */
    id: string;
    /** Account display name. */
    name: string;
    /** Account email. */
    email: string;
  };
  /** Response language for prompts. */
  responseLanguage: string;
  /** Platform descriptor string. */
  platform: string;
  /** Date string for prompt context. */
  date: string;
  /** Client timezone for prompt context. */
  timezone: string;
  /** Python runtime snapshot. */
  python: {
    /** Whether Python is installed. */
    installed: boolean;
    /** Python version string. */
    version?: string;
    /** Python binary path. */
    path?: string;
  };
  /** Available skill summaries. */
  skillSummaries: Array<{
    /** Skill name. */
    name: string;
    /** Skill scope. */
    scope: string;
    /** Skill description. */
    description: string;
    /** Skill file path. */
    path: string;
  }>;
  /** Selected skill names for the prompt. */
  selectedSkills: string[];
};
