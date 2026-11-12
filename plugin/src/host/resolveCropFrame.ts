/**
 * InDesign selection may be the inner Image (full media) while the visible
 * crop lives on the parent graphic frame (Rectangle/Polygon/…).
 * Always prefer the crop frame for bounds, PNG export, and deletion.
 */

export type CropResolveResult = {
  /** Page item to use for export / bounds / remove */
  target: any;
  /** True when we lifted from an inner image to its frame */
  liftedFromImage: boolean;
  imageId?: string;
};

function typeName(item: any): string {
  try {
    return String(item?.constructor?.name || item?.reflect?.name || "");
  } catch {
    return "";
  }
}

export function isImageLikeItem(item: any): boolean {
  const name = typeName(item);
  return /Image|EPS|PDF|ImportedPage|PICT|WMF|SVG/i.test(name);
}

export function isPageSurface(item: any): boolean {
  const name = typeName(item);
  return /^(Page|Spread|Document|Layer|Story|Application)$/i.test(name);
}

/**
 * If `item` is inner placed media, walk to the graphic frame that crops it.
 * Otherwise return the item itself (group / frame / textFrame).
 */
export function resolveToCropFrame(item: any): CropResolveResult {
  if (!item) {
    throw new Error("resolveToCropFrame: item is null");
  }

  if (!isImageLikeItem(item)) {
    return { target: item, liftedFromImage: false };
  }

  const imageId = String(item.id);
  let parent: any = null;
  try {
    parent = item.parent;
  } catch {
    return { target: item, liftedFromImage: false, imageId };
  }

  let guard = 0;
  while (parent && guard++ < 10) {
    if (isPageSurface(parent)) break;
    try {
      const gb = parent.geometricBounds;
      if (gb && !isImageLikeItem(parent) && parent.id != null) {
        return {
          target: parent,
          liftedFromImage: true,
          imageId,
        };
      }
    } catch {
      /* keep walking */
    }
    try {
      parent = parent.parent;
    } catch {
      break;
    }
  }

  return { target: item, liftedFromImage: false, imageId };
}

/** Dedupe resolved page items by id (image+frame both selected → one frame). */
export function uniqueResolvedTargets(items: any[]): {
  targets: any[];
  liftedCount: number;
  notes: string[];
} {
  const byId = new Map<number | string, any>();
  let liftedCount = 0;
  const notes: string[] = [];

  for (const item of items) {
    const resolved = resolveToCropFrame(item);
    if (resolved.liftedFromImage) {
      liftedCount += 1;
      notes.push(
        `内嵌图#${resolved.imageId} → 图框#${resolved.target.id}（仅识别裁切可见区域）`,
      );
    }
    const id = resolved.target.id;
    byId.set(id, resolved.target);
  }

  return { targets: [...byId.values()], liftedCount, notes };
}
