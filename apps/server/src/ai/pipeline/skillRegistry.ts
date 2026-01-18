export type SkillScope = "project" | "parent" | "workspace";

export type SkillMatch = {
  name: string;
  path: string;
  scope: SkillScope;
  content: string;
};

export type SkillResolver = (name: string, roots: SkillRoots) => Promise<SkillMatch | null>;

export type SkillRoots = {
  projectRoot?: string;
  parentRoots?: string[];
  workspaceRoot?: string;
};
