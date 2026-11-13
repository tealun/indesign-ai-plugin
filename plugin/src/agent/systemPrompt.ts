import { getAgent, DEFAULT_AGENT_ID } from "./catalog.js";
import { skillsPromptBlock } from "./skills/registry.js";
import type { AgentTurnPayload } from "./types.js";

export function buildAgentSystemPrompt(agentId: string = DEFAULT_AGENT_ID): string {
  const base = getAgent(agentId).buildSystemPrompt();
  const skills = skillsPromptBlock(agentId);
  return skills ? `${base}\n\n${skills}` : base;
}

export function buildAgentUserPayload(payload: AgentTurnPayload): string {
  return JSON.stringify(
    {
      activeAgentId: payload.activeAgentId || DEFAULT_AGENT_ID,
      project: payload.project,
      experience: payload.experience,
      runtimeContext: payload.context,
      recentHistory: payload.history.slice(-12),
      userMessage: payload.userMessage,
    },
    null,
    2,
  );
}

/** @deprecated */
export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt(DEFAULT_AGENT_ID);
