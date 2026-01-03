export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  finish_reason: string; // e.g., 'stop', 'length'
  model: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

export interface GenerationOptions {
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  // Other common generation options
}

export interface LLMProvider {
  name: string;
  generate(messages: ChatCompletionMessage[], options?: GenerationOptions): Promise<ChatCompletionResponse>;
  // Potentially add methods for other functionalities like embeddings, chat, etc.
}
