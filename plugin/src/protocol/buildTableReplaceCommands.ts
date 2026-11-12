import type { Bounds, LayoutCommand, TableDraft } from "../types/protocol.js";
import { validateTableDraft } from "./tableDraft.js";
import type { ProtocolError } from "../types/protocol.js";

export function buildTableReplaceCommands(args: {
  pageIndex: number;
  bounds: Bounds;
  draft: TableDraft;
  tableStyleName: string;
  selectionIds: string[];
}): { ok: true; commands: LayoutCommand[] } | { ok: false; error: ProtocolError } {
  const validated = validateTableDraft(args.draft);
  if (!validated.ok) return validated;

  if (!args.tableStyleName.trim()) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tableStyleName is required",
        retryable: false,
      },
    };
  }

  if (args.selectionIds.length === 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "selectionIds required for removeObjects",
        retryable: false,
      },
    };
  }

  const { draft, bodyRowCount, columnCount } = validated;
  const commands: LayoutCommand[] = [
    {
      type: "createTextFrame",
      pageIndex: args.pageIndex,
      bounds: args.bounds,
    },
    {
      type: "createTable",
      parentFrameId: "$created.frameId",
      bodyRowCount,
      columnCount,
      headerRowCount: draft.headerRowCount,
      footerRowCount: draft.footerRowCount,
    },
  ];

  for (let r = 0; r < draft.rows.length; r++) {
    const row = draft.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      commands.push({
        type: "writeCellText",
        tableId: "$created.tableId",
        row: r,
        column: c,
        text: row[c]!,
      });
    }
  }

  commands.push({
    type: "applyTableStyle",
    tableId: "$created.tableId",
    name: args.tableStyleName,
  });
  commands.push({
    type: "removeObjects",
    ids: [...args.selectionIds],
  });

  return { ok: true, commands };
}
