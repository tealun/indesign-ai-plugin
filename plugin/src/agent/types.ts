import type { ExperienceScope, TaskStat } from "./memory/types.js";

export type AgentActionType =
  | "none"
  | "lock_selection"
  | "recognize_table"
  | "replace_table"
  | "list_styles"
  | "open_config"
  | "apply_table_style"
  | "propose_grep";

export type AgentAction =
  | { type: "none" }
  | { type: "lock_selection" }
  | { type: "recognize_table" }
  | { type: "replace_table"; styleName: string }
  | { type: "list_styles" }
  | { type: "open_config" }
  | { type: "apply_table_style"; styleName: string }
  | {
      type: "propose_grep";
      find: string;
      changeTo?: string;
      flags?: string;
      note?: string;
    };

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
  /** Suggested specialized agent to load next (handoff from advisor) */
  recommendAgentId?: string;
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
  /** Concatenated story/cell text from locked or live selection (truncated). */
  selectionText: string;
  /** Clipboard plain text (compare agent / optional). */
  clipboardText: string;
  /** Uploaded compare-source document text (parsed). */
  compareDocumentText: string;
  compareDocumentName: string;
  compareDocumentFormat: string;
  hasDraft: boolean;
  /** True when draft exists — replace must NOT re-run vision. */
  readyToReplace: boolean;
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
  activeAgentId?: string;
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
  "apply_table_style",
  "propose_grep",
];

/** Actions an Agent may emit (excludes meta "none"). */
export type AgentHostActionType = Exclude<AgentActionType, "none">;
