import type {
  ChatRequest,
  LayoutCommand,
  ProviderSettings,
  TableDraft,
} from "../types/protocol.js";

export type ProviderRawResponse = {
  text: string;
  status: number;
};

export interface ProviderAdapter {
  id: string;
  supportsVision: boolean;
  chat(
    request: ChatRequest,
    settings: ProviderSettings,
  ): Promise<ProviderRawResponse>;
  parseLayoutCommands(raw: ProviderRawResponse): LayoutCommand[];
  parseTableDraft(raw: ProviderRawResponse): TableDraft;
}
