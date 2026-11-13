import type { Bounds, DocumentSnapshot, SelectionItem } from "../types/protocol.js";

export type LockedSelection = {
  snapshot: DocumentSnapshot;
  ids: string[];
  boundsById: Record<string, Bounds>;
  unionBounds: Bounds;
  pageIndex: number;
  capturedAt: number;
};

let locked: LockedSelection | null = null;

export function lockSelection(
  snapshot: DocumentSnapshot,
  unionBounds: Bounds,
): LockedSelection {
  const ids = snapshot.selection.map((s) => s.id);
  const boundsById: Record<string, Bounds> = {};
  for (const item of snapshot.selection) {
    boundsById[item.id] = { ...item.bounds };
  }
  locked = {
    snapshot,
    ids,
    boundsById,
    unionBounds,
    pageIndex: snapshot.pageIndex,
    capturedAt: Date.now(),
  };
  return locked;
}

export function getLockedSelection(): LockedSelection | null {
  return locked;
}

export function clearLockedSelection(): void {
  locked = null;
}

export function selectionSummary(items: SelectionItem[]): string {
  if (items.length === 0) return "无选区";
  if (items.length === 1) {
    const i = items[0]!;
    if (i.type === "graphic" && i.normalizedFromImageId) {
      return `1 个图框`;
    }
    return `1 个${i.type === "textFrame" ? "文本框" : i.type === "group" ? "编组" : "对象"}`;
  }
  const groups = items.filter((i) => i.type === "group").length;
  if (groups === items.length) return `${items.length} 个编组`;
  return `${items.length} 个对象`;
}
