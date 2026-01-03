import axios from 'axios';
import { LLMProvider, ChatCompletionMessage, ChatCompletionResponse, GenerationOptions } from '../types/llm';
import { ProviderConfig } from '../types/config';
import { logger } from '../services/loggerService';

// Ollama API documentation: https://github.com/ollama/ollama/blob/main/docs/api.md

interface OllamaResponse {
    model: string;
    created_at: string;
    message: {
        role: 'assistant';
        content: string;
    };
    done: boolean;
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
    eval_count: number;
}

export class OllamaProvider implements LLMProvider {
  public readonly name: string = 'Ollama';
  private client: any;
  private model: string;
  private baseUrl: string;

  constructor(private config: ProviderConfig) {
    if (config.type !== 'ollama') {
      logger.error(`OllamaProvider initialized with incorrect config type: ${config.type}`);
      throw new Error('OllamaProvider must be initialized with an OllamaProviderConfig.');
    }
    this.model = config.model;
    this.baseUrl = config.base_url;
    this.client = axios.create({
      baseURL: `${this.baseUrl}/api`,
      timeout: 600000, // 10 minutes timeout for generation
    });
  }

  async generate(messages: ChatCompletionMessage[], options?: GenerationOptions): Promise<ChatCompletionResponse> {
    logger.info(`OllamaProvider: Generating completion for model ${this.model}`);
    const ollamaMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));

    const payload = {
      model: this.model,
      messages: ollamaMessages,
      options: {
        temperature: options?.temperature,
        num_predict: options?.max_tokens,
        stop: options?.stop,
      },
      stream: false, // For now, we don't support streaming
    };

    try {
      const response = await this.client.post('/chat', payload);
      const data: OllamaResponse = response.data;

      if (!data || !data.message || !data.message.content) {
        logger.error(`OllamaProvider: Invalid response structure received: ${JSON.stringify(data)}`);
        throw new Error('Invalid response structure from Ollama API.');
      }

      const finishReason = data.done ? 'stop' : 'length'; // Ollama uses 'done' field

      logger.info(`OllamaProvider: Completion generated (model: ${data.model}, eval_count: ${data.eval_count})`);

      return {
        content: data.message.content,
        finish_reason: finishReason,
        model: data.model,
        prompt_eval_count: data.prompt_eval_count,
        eval_count: data.eval_count,
        total_duration: data.total_duration,
      };
    } catch (error: any) {
      logger.error(`OllamaProvider: API call failed for model ${this.model}: ${error.message}`);
      if ((axios as any).isAxiosError(error) && error.response) {
        logger.error(`OllamaProvider: API Response error: ${JSON.stringify(error.response.data)}`);
        throw new Error(`Ollama API error: ${error.response.status} - ${error.response.data.error || error.message}`);
      }
      throw new Error(`Failed to generate completion from Ollama API: ${error.message}`);
    }
  }
}