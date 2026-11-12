import type { ExecutionReport, LayoutCommand } from "../types/protocol.js";

/** Host port — real InDesign wiring lands in later slices. */
export interface DocumentHost {
  /** Resolve $created.* and execute one whitelist command. */
  execute(command: LayoutCommand, ctx: ExecuteContext): Promise<ExecuteStepResult>;
  styleExists(kind: "table" | "para" | "char", name: string): Promise<boolean>;
  objectExists(id: string): Promise<boolean>;
  getObjectBounds(id: string): Promise<import("../types/protocol.js").Bounds | null>;
}

export type ExecuteContext = {
  created: {
    frameId?: string;
    tableId?: string;
    /** Intended geometric footprint for the replacement frame (stable position). */
    frameBounds?: import("../types/protocol.js").Bounds;
  };
};

export type ExecuteStepResult = {
  ok: boolean;
  createdId?: string;
  errorMessage?: string;
};

export type RunBatchOptions = {
  requestId: string;
  commands: LayoutCommand[];
  host: DocumentHost;
};
