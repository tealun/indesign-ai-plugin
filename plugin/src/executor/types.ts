import type { ExecutionReport, LayoutCommand } from "../types/protocol.js";

/** Host port — real InDesign wiring lands in later slices. */
export interface DocumentHost {
  /** Resolve $created.* and execute one whitelist command. */
  execute(command: LayoutCommand, ctx: ExecuteContext): Promise<ExecuteStepResult>;
  styleExists(kind: "table" | "para" | "char", name: string): Promise<boolean>;
  objectExists(id: string): Promise<boolean>;
  getObjectBounds(
    id: string,
  ): Promise<{ x: number; y: number; w: number; h: number } | null>;
}

export type ExecuteContext = {
  created: { frameId?: string; tableId?: string };
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
