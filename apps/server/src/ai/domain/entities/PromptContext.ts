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
