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
