import type { ExperienceScope, TaskStat } from "./memory/types.js";

export type AgentActionType =
  | "none"
  | "lock_selection"
  | "recognize_table"
  | "replace_table"
  | "list_styles"
  | "open_config";

export type AgentAction =
  | { type: "none" }
  | { type: "lock_selection" }
  | { type: "recognize_table" }
  | { type: "replace_table"; styleName: string }
  | { type: "list_styles" }
  | { type: "open_config" };

export type AgentLessonDraft = {
  scope: ExperienceScope;
  text: string;
  taskId?: string;
};

export type AgentDecision = {
  /** Natural-language reply shown in the chat bubble */
  reply: string;
  /** Identified programmatic task */
  taskId?: string;
  /** Whitelisted side effects the host may run, in order */
  actions: AgentAction[];
  /** Experiences to persist after the turn */
  lessons?: AgentLessonDraft[];
};

export type AgentChatMessage = {
  role: "user" | "assistant" | "system";
  text: string;
};

export type AgentRuntimeContext = {
  selectionLocked: boolean;
  selectionSummary: string;
  hasDraft: boolean;
  draftPreview: string;
  tableStyles: string[];
  selectedStyle: string;
  hasPatchImage: boolean;
};

export type AgentProjectRef = {
  key: string;
  name: string;
  path?: string;
};

export type AgentExperienceSlice = {
  agentLessons: string[];
  userLessons: string[];
  projectLessons: string[];
  projectPreferredTableStyle?: string;
  taskStats: Record<string, TaskStat>;
  recentDigests: string[];
  projectName?: string;
};

export type AgentTurnPayload = {
  project: AgentProjectRef | null;
  experience: AgentExperienceSlice;
  context: AgentRuntimeContext;
  history: AgentChatMessage[];
  userMessage: string;
};

export const AGENT_ACTION_TYPES: AgentActionType[] = [
  "none",
  "lock_selection",
  "recognize_table",
  "replace_table",
  "list_styles",
  "open_config",
];
