import axios from 'axios';
import { LLMProvider, ChatCompletionMessage, ChatCompletionResponse, GenerationOptions } from '../types/llm';
import { ProviderConfig } from '../types/config';
import { logger } from '../services/loggerService';

// OpenRouter API documentation: https://openrouter.ai/docs#chat-completions

interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        message: {
            role: 'assistant';
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}


export class OpenRouterProvider implements LLMProvider {
  public readonly name: string = 'OpenRouter';
  private client: any;
  private model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(private config: ProviderConfig) {
    if (config.type !== 'openrouter') {
      logger.error(`OpenRouterProvider initialized with incorrect config type: ${config.type}`);
      throw new Error('OpenRouterProvider must be initialized with an OpenRouterProviderConfig.');
    }
    if (!config.api_key) {
      logger.error('OpenRouterProvider requires an API key in its configuration.');
      throw new Error('OpenRouter API key is missing.');
    }
    this.model = config.model;
    this.baseUrl = config.base_url || 'https://openrouter.ai/api/v1'; // Default OpenRouter base URL
    this.apiKey = config.api_key;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 600000, // 10 minutes timeout for generation
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async generate(messages: ChatCompletionMessage[], options?: GenerationOptions): Promise<ChatCompletionResponse> {
    logger.info(`OpenRouterProvider: Generating completion for model ${this.model}`);

    const payload = {
      model: this.model,
      messages: messages,
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
      stop: options?.stop,
      stream: false, // For now, we don't support streaming
    };

    try {
      const response = await this.client.post('/chat/completions', payload);
      const data: OpenAIResponse = response.data;

      if (!data || !data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
        logger.error(`OpenRouterProvider: Invalid response structure received: ${JSON.stringify(data)}`);
        throw new Error('Invalid response structure from OpenRouter API.');
      }

      const choice = data.choices[0];
      const finishReason = choice.finish_reason || 'stop'; // OpenAI compatible API usually has finish_reason

      logger.info(`OpenRouterProvider: Completion generated (model: ${this.model}, finish_reason: ${finishReason})`);

      return {
        content: choice.message.content,
        finish_reason: finishReason,
        model: data.model, // OpenRouter might echo the model name
      };
    } catch (error: any) {
      logger.error(`OpenRouterProvider: API call failed for model ${this.model}: ${error.message}`);
      if ((axios as any).isAxiosError(error) && error.response) {
        logger.error(`OpenRouterProvider: API Response error: ${JSON.stringify(error.response.data)}`);
        throw new Error(`OpenRouter API error: ${error.response.status} - ${error.response.data.error?.message || error.message}`);
      }
      throw new Error(`Failed to generate completion from OpenRouter API: ${error.message}`);
    }
  }
}