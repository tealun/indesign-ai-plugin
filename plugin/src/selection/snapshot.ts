import type { DocumentSnapshot } from "../types/protocol.js";
import { isInDesignRuntime } from "../host/uxpRequire.js";
import { readLiveSelectionSnapshot } from "../host/indesignHost.js";

export async function readSelectionSnapshot(): Promise<DocumentSnapshot> {
  if (!isInDesignRuntime()) {
    return {
      documentName: "(browser stub)",
      pageIndex: 0,
      selection: [],
    };
  }
  return readLiveSelectionSnapshot();
}
