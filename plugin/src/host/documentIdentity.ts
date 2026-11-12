import { isInDesignRuntime, tryRequireIndesign } from "./uxpRequire.js";

export type DocumentIdentity = {
  /** Stable-ish key for project memory isolation */
  key: string;
  name: string;
  path?: string;
};

/** Hash-ish short key from a path/name (no crypto dependency required in UXP). */
function fingerprint(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/**
 * Identity of the active InDesign document for project-scoped memory.
 * Different open files must not share project lessons.
 */
export function getActiveDocumentIdentity(): DocumentIdentity | null {
  if (!isInDesignRuntime()) {
    return { key: "stub:no-document", name: "(stub)" };
  }
  try {
    const mod = tryRequireIndesign();
    const app = mod?.app;
    if (!app?.documents || app.documents.length < 1) return null;
    const doc = app.activeDocument;
    const name = String(doc.name || "untitled");
    let path = "";
    try {
      path = String(doc.fullName?.absoluteURI || doc.fullName || doc.filePath || "");
    } catch {
      path = "";
    }
    const basis = path || name;
    const key = `doc:${fingerprint(basis)}:${name}`;
    return path ? { key, name, path } : { key, name };
  } catch {
    return null;
  }
}
