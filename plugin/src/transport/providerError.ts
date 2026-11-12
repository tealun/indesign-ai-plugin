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
  const base = settings.baseUrl.replace(/\/$/, "");
  const url = `${base}${pathHint}`;
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
    `请求：POST ${url}`,
    `model=${settings.model || "（空）"}`,
  ];
  if (snippet) parts.push(`响应：${snippet}`);
  else parts.push("响应：（空）");
  if (status === 404) {
    parts.push(
      "请到「配置」核对：Base URL 一般形如 https://主机/v1（不要多写 /chat/completions）；Model 填中转站支持的识图型号（如 gpt-4o）。",
    );
  }
  return new Error(parts.join("\n"));
}
