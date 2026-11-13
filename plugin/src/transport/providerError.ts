import type { ProviderSettings } from "../types/protocol.js";

function truncate(text: string, max = 280): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function formatProviderHttpError(
  status: number,
  body: string,
  settings: ProviderSettings,
  pathHint: string,
): Error {
  // Do not echo baseUrl/host/port — config page is the only place to inspect endpoints.
  const snippet = truncate(body || "");
  const authHint =
    status === 401 || status === 403
      ? "（API Key 无效或无权限）"
      : "";
  const notFoundHint =
    status === 404
      ? "（常见原因：Base URL 路径不对，或模型名在中转站不存在）"
      : "";
  const parts = [
    `模型接口返回 HTTP ${status}${authHint}${notFoundHint}`,
    `请求路径：POST ${pathHint}（完整地址仅在「配置」查看）`,
    `model=${settings.model || "（空）"}`,
  ];
  if (snippet) parts.push(`响应：${snippet}`);
  else parts.push("响应：（空）");
  if (status === 404) {
    const retired = /retired|model_not_found|Select an available replacement/i.test(body);
    if (retired) {
      parts.push(
        "模型名已被中转站下线。请打开「配置」，把 Model 改成报错里建议的型号（并确认 Wire API：Codex 类选 Responses）。",
      );
    } else {
      parts.push(
        "请到「配置」核对：Base URL 形如 https://主机/v1；Codex wire_api=responses 时 Wire API 必须选 Responses；Model 填中转站仍可用的识图型号。",
      );
    }
  }
  return new Error(parts.join("\n"));
}
