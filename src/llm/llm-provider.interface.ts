export type LlmTextBlock = {
  type: "text";
  text: string;
};

export type LlmToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type LlmToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
};

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock | LlmToolResultBlock;

export type LlmMessage = {
  role: "user" | "assistant";
  content: string | LlmContentBlock[];
};

export type LlmToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type LlmCompletionParams = {
  systemPrompt: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
  maxTokens?: number;
  temperature?: number;
};

export type LlmCompletionResult = {
  stopReason: string;
  content: LlmContentBlock[];
};

export interface LlmProvider {
  complete(params: LlmCompletionParams): Promise<LlmCompletionResult>;
}
