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
  return items
    .map((i) => {
      if (i.type === "graphic" && i.normalizedFromImageId) {
        return `graphic#${i.id}(图框←图${i.normalizedFromImageId})`;
      }
      return `${i.type}#${i.id}`;
    })
    .join(", ");
}
