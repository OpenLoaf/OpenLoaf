export type MessageKind = "system" | "user" | "assistant" | "tool";

export type ChatMessage = {
  /** Message id. */
  id: string;
  /** Message kind. */
  kind: MessageKind;
  /** Message content. */
  content: string;
};

export type ModelCandidate = {
  /** Provider id. */
  providerId: string;
  /** Model id. */
  modelId: string;
  /** Optional score. */
  score?: number;
};

export type ProjectSummary = {
  /** Project id. */
  projectId: string;
  /** Summary content. */
  summary: string;
  /** Updated time. */
  updatedAt: Date;
};

export type ScheduleJob = {
  /** Job id. */
  jobId: string;
  /** Run time. */
  runAt: Date;
  /** Optional payload. */
  payload?: Record<string, unknown>;
};

export type SkillSummary = {
  /** Skill id. */
  id: string;
  /** Summary content. */
  summary: string;
};

export type TaskStatus = "pending" | "running" | "completed" | "failed";

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

export type AttachmentRef = {
  /** Attachment path. */
  path: string;
  /** Optional media type. */
  mediaType?: string;
};

export type ModelSelectionSpec = {
  /** Optional preferred model id. */
  preferredModelId?: string;
  /** Required tags for model selection. */
  requiredTags?: string[];
};

export type RequestScope = {
  /** Session id for the request. */
  sessionId: string;
  /** Workspace id for the request. */
  workspaceId?: string;
  /** Project id for the request. */
  projectId?: string;
  /** Board id for the request. */
  boardId?: string;
  /** Client id for the request. */
  clientId?: string;
  /** Tab id for the request. */
  tabId?: string;
  /** Request correlation id. */
  requestId?: string;
  /** Selected skill names for the request. */
  selectedSkills?: string[];
  /** Parent project root paths for scope validation. */
  parentProjectRootPaths?: string[];
};

export type ToolsetSpec = {
  /** Included tool ids. */
  include?: string[];
  /** Excluded tool ids. */
  exclude?: string[];
};
