import type { DocumentHost, ExecuteContext, ExecuteStepResult } from "./types.js";
import type { Bounds, LayoutCommand } from "../types/protocol.js";

/** Dry-run host for panel scaffolding / unit tests — does not touch InDesign. */
export function createStubHost(options?: {
  tableStyles?: string[];
}): DocumentHost {
  const tableStyles = new Set(options?.tableStyles ?? ["Catalog-Table"]);
  let seq = 1;
  const objects = new Map<string, Bounds>();

  return {
    async styleExists(kind, name) {
      if (kind === "table") return tableStyles.has(name);
      return true;
    },
    async objectExists(id) {
      return objects.has(id) || id.startsWith("sel_");
    },
    async getObjectBounds(id) {
      if (objects.has(id)) return objects.get(id)!;
      if (id.startsWith("sel_")) {
        return { x: 0, y: 0, w: 10, h: 10, unit: "pt" };
      }
      return null;
    },
    async execute(command: LayoutCommand, _ctx: ExecuteContext): Promise<ExecuteStepResult> {
      switch (command.type) {
        case "createTextFrame": {
          const id = `tf_stub_${seq++}`;
          objects.set(id, { ...command.bounds, unit: "pt" });
          return { ok: true, createdId: id };
        }
        case "createTable": {
          if (!command.parentFrameId) {
            return { ok: false, errorMessage: "parentFrameId required" };
          }
          const id = `table_stub_${seq++}`;
          return { ok: true, createdId: id };
        }
        case "writeCellText":
        case "applyTableStyle":
        case "setFontSize":
        case "setLeading":
        case "setAlignment":
        case "setSpaceBeforeAfter":
        case "createParaStyle":
        case "applyParaStyle":
        case "createCharStyle":
        case "applyCharStyle":
        case "moveResizeFrame":
          return { ok: true };
        case "removeObjects":
          for (const id of command.ids) objects.delete(id);
          return { ok: true };
        default:
          return { ok: false, errorMessage: "unsupported in stub" };
      }
    },
  };
}
