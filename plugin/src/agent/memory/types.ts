export type ExperienceScope = "agent" | "user" | "project" | "task";

export type ExperienceNote = {
  id: string;
  scope: ExperienceScope;
  text: string;
  taskId?: string;
  projectKey?: string;
  createdAt: string;
  /** How many times this note was useful / reinforced */
  hits?: number;
};

export type TaskStat = {
  success: number;
  fail: number;
  lastStyleName?: string;
  lastAt?: string;
};

export type ProjectMemory = {
  key: string;
  documentName: string;
  /** Stable hint if path available */
  documentPath?: string;
  preferredTableStyle?: string;
  lessons: ExperienceNote[];
  taskStats: Record<string, TaskStat>;
  /** Short digests of past sessions (not full chat logs) */
  digests: string[];
  updatedAt: string;
};

export type UserMemory = {
  preferredLocale: "zh-CN";
  defaultWireHint?: string;
  lessons: ExperienceNote[];
  updatedAt: string;
};

export type AgentMemoryRoot = {
  version: 1;
  agentLessons: ExperienceNote[];
  user: UserMemory;
  projects: Record<string, ProjectMemory>;
};
