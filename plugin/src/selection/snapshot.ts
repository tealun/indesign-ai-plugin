import type { DocumentSnapshot } from "../types/protocol.js";

/**
 * Read current InDesign selection into DocumentSnapshot.
 * Scaffold returns empty selection until host bridge is wired (M0-T slice 1).
 */
export async function readSelectionSnapshot(): Promise<DocumentSnapshot> {
  return {
    documentName: "(no document bridge yet)",
    pageIndex: 0,
    selection: [],
  };
}
