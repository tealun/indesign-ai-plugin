import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyMemory,
  getOrCreateProject,
  memorySliceForPrompt,
  recordTaskOutcome,
  rememberNote,
} from "./store.js";

describe("agent memory store", () => {
  it("isolates projects by key", () => {
    const root = emptyMemory();
    getOrCreateProject(root, { key: "doc:a", name: "A.indd" });
    getOrCreateProject(root, { key: "doc:b", name: "B.indd" });
    rememberNote(root, {
      scope: "project",
      projectKey: "doc:a",
      text: "A 偏好货号信息表",
      taskId: "m0t.replace_with_style",
    });
    const sliceA = memorySliceForPrompt(root, "doc:a");
    const sliceB = memorySliceForPrompt(root, "doc:b");
    assert.ok(sliceA.projectLessons.some((t) => t.includes("货号信息表")));
    assert.equal(sliceB.projectLessons.length, 0);
  });

  it("records preferred style on success", () => {
    const root = emptyMemory();
    getOrCreateProject(root, { key: "doc:a", name: "A.indd" });
    recordTaskOutcome(root, "doc:a", "m0t.vector_table_recover", true, "[货号信息表]");
    const slice = memorySliceForPrompt(root, "doc:a");
    assert.equal(slice.projectPreferredTableStyle, "[货号信息表]");
    assert.equal(slice.taskStats["m0t.vector_table_recover"]?.success, 1);
  });
});
