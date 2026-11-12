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

export type AgentDecision = {
  /** Natural-language reply shown in the chat bubble */
  reply: string;
  /** Whitelisted side effects the host may run, in order */
  actions: AgentAction[];
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

export type AgentTurnPayload = {
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
