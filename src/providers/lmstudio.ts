import axios from 'axios';
import { LLMProvider, ChatCompletionMessage, ChatCompletionResponse, GenerationOptions } from '../types/llm';
import { ProviderConfig } from '../types/config';
import { logger } from '../services/loggerService';

// LM Studio's local server API is largely OpenAI-compatible.
// Refer to OpenAI Chat API documentation for details: https://platform.openai.com/docs/api-reference/chat/create

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

export class LMStudioProvider implements LLMProvider {
  public readonly name: string = 'LM Studio';
  private client: any;
  private model: string;
  private baseUrl: string;

  constructor(private config: ProviderConfig) {
    if (config.type !== 'lmstudio') {
      logger.error(`LMStudioProvider initialized with incorrect config type: ${config.type}`);
      throw new Error('LMStudioProvider must be initialized with an LMStudioProviderConfig.');
    }
    this.model = config.model;
    this.baseUrl = config.base_url;
    this.client = axios.create({
      baseURL: `${this.baseUrl}/v1`, // LM Studio uses /v1 for OpenAI compatible API
      timeout: 600000, // 10 minutes timeout for generation
    });
  }

  async generate(messages: ChatCompletionMessage[], options?: GenerationOptions): Promise<ChatCompletionResponse> {
    logger.info(`LMStudioProvider: Generating completion for model ${this.model}`);

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
        logger.error(`LMStudioProvider: Invalid response structure received: ${JSON.stringify(data)}`);
        throw new Error('Invalid response structure from LM Studio API.');
      }

      const choice = data.choices[0];
      const finishReason = choice.finish_reason || 'stop'; // OpenAI compatible API usually has finish_reason

      logger.info(`LMStudioProvider: Completion generated (model: ${this.model}, finish_reason: ${finishReason})`);

      return {
        content: choice.message.content,
        finish_reason: finishReason,
        model: data.model, // LM Studio might echo the model name
        // LM Studio might not provide prompt_eval_count/eval_count directly in OpenAI format
        // These fields might need to be adapted or left undefined
      };
    } catch (error: any) {
      logger.error(`LMStudioProvider: API call failed for model ${this.model}: ${error.message}`);
      if ((axios as any).isAxiosError(error) && error.response) {
        logger.error(`LMStudioProvider: API Response error: ${JSON.stringify(error.response.data)}`);
        throw new Error(`LM Studio API error: ${error.response.status} - ${error.response.data.error?.message || error.message}`);
      }
      throw new Error(`Failed to generate completion from LM Studio API: ${error.message}`);
    }
  }
}