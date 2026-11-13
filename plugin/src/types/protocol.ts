/** Shared JSON protocol types — source of truth in docs/00_core/00_04_JSON_Protocol.md */

export const PROTOCOL_VERSION = "0.1" as const;

export type ProtocolOp =
  | "analyze_and_plan"
  | "apply_commands"
  | "recover_table"
  | "agent_turn"
  | "ping";

export type Bounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  unit: "pt";
};

export type SelectionItem =
  | {
      id: string;
      type: "textFrame";
      storyText?: string;
      appliedParaStyle?: string | null;
      appliedCharStyle?: string | null;
      fontFamily?: string;
      fontSize?: number;
      leading?: number;
      alignment?: string;
      bounds: Bounds;
      spaceBefore?: number;
      spaceAfter?: number;
    }
  | {
      id: string;
      type: "group";
      bounds: Bounds;
      childCount?: number;
      notes?: string;
      /** Harvested plain text when group contains frames/tables */
      storyText?: string;
    }
  | {
      id: string;
      type: "graphic";
      bounds: Bounds;
      /** Crop frame that contains a placed image (visible area). */
      role?: "frame" | "imageContent";
      /** When id is a frame lifted from an inner Image selection */
      normalizedFromImageId?: string;
      notes?: string;
      /** Harvested text when selection is a Table/Cell or similar */
      storyText?: string;
    };

export type DocumentSnapshot = {
  documentName: string;
  pageIndex: number;
  selection: SelectionItem[];
};

export type ProtocolErrorCode =
  | "PROVIDER_AUTH"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_HTTP"
  | "PARSE_ERROR"
  | "VALIDATION_ERROR"
  | "EXECUTE_ERROR"
  | "CANCELLED";

export type ProtocolError = {
  code: ProtocolErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
};

export type TableDraft = {
  headerRowCount: number;
  footerRowCount: number;
  suggestedTableStyleName?: string;
  rows: string[][];
};

export type LayoutCommand =
  | { type: "setFontSize"; targetId: string; size: number }
  | { type: "setLeading"; targetId: string; leading: number }
  | { type: "setAlignment"; targetId: string; alignment: string }
  | { type: "setSpaceBeforeAfter"; targetId: string; before?: number; after?: number }
  | { type: "createParaStyle"; name: string; props: Record<string, unknown> }
  | { type: "applyParaStyle"; targetId: string; name: string }
  | { type: "createCharStyle"; name: string; props: Record<string, unknown> }
  | { type: "applyCharStyle"; targetId: string; name: string }
  | { type: "createTextFrame"; pageIndex: number; bounds: Bounds; text?: string }
  | { type: "moveResizeFrame"; targetId: string; bounds: Bounds }
  | {
      type: "createTable";
      parentFrameId: string;
      bodyRowCount: number;
      columnCount: number;
      headerRowCount: number;
      footerRowCount: number;
    }
  | { type: "writeCellText"; tableId: string; row: number; column: number; text: string }
  | { type: "applyTableStyle"; tableId: string; name: string }
  | { type: "removeObjects"; ids: string[] };

export const M0_COMMAND_TYPES = [
  "setFontSize",
  "setLeading",
  "setAlignment",
  "setSpaceBeforeAfter",
  "createParaStyle",
  "applyParaStyle",
  "createCharStyle",
  "applyCharStyle",
  "createTextFrame",
  "moveResizeFrame",
] as const;

export const M0T_COMMAND_TYPES = [
  "createTable",
  "writeCellText",
  "applyTableStyle",
  "removeObjects",
] as const;

export const ALL_WHITELIST_TYPES = [
  ...M0_COMMAND_TYPES,
  ...M0T_COMMAND_TYPES,
] as const;

export type WhitelistType = (typeof ALL_WHITELIST_TYPES)[number];

export type CommandResult = {
  index: number;
  type: string;
  ok: boolean;
  createdId?: string;
  error?: ProtocolError;
};

export type ExecutionReport = {
  requestId: string;
  ok: boolean;
  created?: {
    frameId?: string;
    tableId?: string;
  };
  results: CommandResult[];
  stoppedAt?: number;
  removeObjectsSkipped?: boolean;
};

export type ProviderType =
  | "openai_compatible"
  | "anthropic"
  | "google_gemini"
  | "custom_openai_compatible";

/** OpenAI-compatible relays: classic chat completions vs Responses API (Codex wire_api). */
export type OpenAiWireApi = "chat_completions" | "responses";

/**
 * How the panel reaches a model.
 * - `byok`: user-supplied Base URL / API Key / Model (current shipping path)
 * - `plugin_default`: reserved for a vendor-hosted default model (not enabled yet)
 */
export type AiConnectionMode = "byok" | "plugin_default";

export type ProviderSettings = {
  /** Active connection path. Default / only-supported: byok. */
  connectionMode: AiConnectionMode;
  provider: ProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  /** Only used by openai_compatible / custom_openai_compatible. Default chat_completions. */
  wireApi?: OpenAiWireApi;
};

export type ChatRequest = {
  op: ProtocolOp;
  locale?: string;
  snapshot?: DocumentSnapshot;
  styleProfile?: Record<string, unknown>;
  /** data URL or opaque ref — never log full content by default */
  imageDataUrl?: string;
  userNote?: string;
};
