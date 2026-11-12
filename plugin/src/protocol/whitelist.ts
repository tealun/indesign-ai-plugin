import {
  ALL_WHITELIST_TYPES,
  type LayoutCommand,
  type ProtocolError,
  type WhitelistType,
} from "../types/protocol.js";

const ALLOWED = new Set<string>(ALL_WHITELIST_TYPES);

export function isWhitelistType(type: string): type is WhitelistType {
  return ALLOWED.has(type);
}

/** Fail-closed: any unknown type rejects the entire batch before execute. */
export function validateCommandBatch(
  commands: LayoutCommand[],
): { ok: true } | { ok: false; error: ProtocolError } {
  if (!Array.isArray(commands)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "commands must be an array",
        retryable: false,
      },
    };
  }

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (!cmd || typeof cmd !== "object" || !("type" in cmd)) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `command[${i}] missing type`,
          details: { index: i },
          retryable: false,
        },
      };
    }
    if (!isWhitelistType(cmd.type)) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `unknown command type: ${String(cmd.type)}`,
          details: { index: i, type: cmd.type },
          retryable: false,
        },
      };
    }
    if (cmd.type === "setHeaderFooterRowCount" as string) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "setHeaderFooterRowCount is not on M0-T main path",
          details: { index: i },
          retryable: false,
        },
      };
    }
  }

  return { ok: true };
}
