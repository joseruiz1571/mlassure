import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmProvider,
  LlmCompletionParams,
  LlmCompletionResult,
  LlmContentBlock,
} from "./llm-provider.interface.js";

export type AnthropicProviderOptions = {
  apiKey?: string;
  model?: string;
  /** Default temperature for complete() when the caller does not pass one. 0 is valid. */
  temperature?: number;
};

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  /** Alias or snapshot id requested for this run — logged by the CLI. */
  readonly model: string;
  /** Instance default; `params.temperature ?? this.temperature` so 0 is not swallowed. */
  readonly temperature: number;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required. Set it in .env, pass it to AnthropicProvider, or (in Docker) run with -e ANTHROPIC_API_KEY."
      );
    }
    this.client = new Anthropic({ apiKey });
    // MLASSURE_MODEL is documented in .env.example but was previously unread.
    this.model = options.model ?? process.env["MLASSURE_MODEL"] ?? "claude-sonnet-4-6";
    this.temperature = options.temperature ?? 0.1;
  }

  async complete(params: LlmCompletionParams): Promise<LlmCompletionResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? this.temperature,
      system: params.systemPrompt,
      // Cast through unknown — our LlmMessage is structurally compatible with
      // Anthropic.MessageParam but TS can't verify the union overlap without
      // importing SDK types into the interface layer.
      messages: params.messages as unknown as Anthropic.MessageParam[],
      tools: params.tools as unknown as Anthropic.Tool[],
    });

    return {
      stopReason: response.stop_reason ?? "end_turn",
      content: response.content as unknown as LlmContentBlock[],
    };
  }
}
