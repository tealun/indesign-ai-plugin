import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_CATALOG,
  DEFAULT_AGENT_ID,
  getAgent,
  listSpecializedAgents,
} from "./catalog.js";
import { AGENT_ACTION_TYPES, type AgentActionType } from "./types.js";
import { TASK_CATALOG } from "./tasks.js";

const HOST_ACTIONS = new Set(
  AGENT_ACTION_TYPES.filter((t) => t !== "none") as AgentActionType[],
);

describe("agent catalog invariants", () => {
  it("default advisor only allows open_config", () => {
    assert.deepEqual(getAgent(DEFAULT_AGENT_ID).allowedActions, ["open_config"]);
  });

  it("every allowedActions entry is a known host action type", () => {
    for (const agent of AGENT_CATALOG) {
      for (const a of agent.allowedActions) {
        assert.ok(
          HOST_ACTIONS.has(a as AgentActionType),
          `${agent.id} unknown action ${a}`,
        );
      }
    }
  });

  it("specialized agents are listed and have non-empty allowlists", () => {
    const specs = listSpecializedAgents();
    assert.ok(specs.length >= 5);
    for (const a of specs) {
      assert.ok(a.specialized);
      assert.ok(a.allowedActions.length > 0);
    }
  });

  it("task emits are subset of some agent's allowedActions or empty", () => {
    const union = new Set(
      AGENT_CATALOG.flatMap((a) => a.allowedActions as string[]),
    );
    for (const task of TASK_CATALOG) {
      for (const e of task.emits) {
        assert.ok(
          union.has(e),
          `task ${task.id} emits ${e} not in any agent allowlist`,
        );
      }
    }
  });

  it("only table_recover may emit replace_table / recognize_table", () => {
    for (const agent of AGENT_CATALOG) {
      if (agent.id === "m0t.table_recover") continue;
      assert.ok(!agent.allowedActions.includes("replace_table"));
      assert.ok(!agent.allowedActions.includes("recognize_table"));
    }
  });
});
