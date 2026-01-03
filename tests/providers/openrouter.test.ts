import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { ProviderConfig } from '../../src/types/config';
import { ChatCompletionMessage, ChatCompletionResponse } from '../../src/types/llm';
import { logger } from '../../src/services/loggerService';

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('OpenRouterProvider', () => {
  let mock: MockAdapter;
  const mockProviderConfig: ProviderConfig = {
    type: 'openrouter',
    base_url: 'https://openrouter.ai/api/v1',
    model: 'openrouter/test-model',
    api_key: 'test-api-key',
  };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should be initialized with the correct config and create an axios client with auth header', () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    expect(provider.name).toBe('OpenRouter');
    // Verify base_url and auth header indirectly via mock history in generate tests
    // A direct way to test axios.create headers is not straightforward with axios-mock-adapter
  });

  it('should throw an error if initialized with an incorrect config type', () => {
    const invalidConfig: ProviderConfig = {
      type: 'ollama', // Incorrect type
      base_url: 'http://localhost:1234',
      model: 'invalid-model',
    };
    expect(() => new OpenRouterProvider(invalidConfig)).toThrow('OpenRouterProvider must be initialized with an OpenRouterProviderConfig.');
  });

  it('should throw an error if API key is missing', () => {
    const configWithoutKey: ProviderConfig = {
      ...mockProviderConfig,
      api_key: undefined, // Missing API key
    };
    expect(() => new OpenRouterProvider(configWithoutKey)).toThrow('OpenRouter API key is missing.');
  });

  it('should send a correct request payload with Authorization header and parse a successful response', async () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Hello, OpenRouter!' }];
    const expectedResponse: any = {
      id: 'chatcmpl-openrouter-test',
      object: 'chat.completion',
      created: 1678886400,
      model: mockProviderConfig.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'This is a test response from OpenRouter.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };

    mock.onPost('/chat/completions').reply(200, expectedResponse);

    const result = await provider.generate(messages);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Hello, OpenRouter!' }],
      temperature: undefined,
      max_tokens: undefined,
      stop: undefined,
      stream: false,
    }));
    expect(mock.history.post[0].headers?.Authorization).toBe(`Bearer ${mockProviderConfig.api_key}`);

    const expectedChatCompletionResponse: ChatCompletionResponse = {
      content: 'This is a test response from OpenRouter.',
      finish_reason: 'stop',
      model: mockProviderConfig.model,
    };
    expect(result).toEqual(expectedChatCompletionResponse);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Generating completion for model openrouter/test-model'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Completion generated (model: openrouter/test-model, finish_reason: stop)'));
  });

  it('should handle API errors and throw a custom error message', async () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Error test.' }];
    const errorMessage = 'Unauthorized';

    mock.onPost('/chat/completions').reply(401, { error: { message: errorMessage } });

    await expect(provider.generate(messages)).rejects.toThrow(`OpenRouter API error: 401 - ${errorMessage}`);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model openrouter/test-model'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`API Response error: {"error":{"message":"${errorMessage}"}}`));
  });

  it('should handle network errors and throw a generic error message', async () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Network error test.' }];

    mock.onPost('/chat/completions').networkError();

    await expect(provider.generate(messages)).rejects.toThrow('Failed to generate completion from OpenRouter API: Network Error');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model openrouter/test-model'));
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('API Response error')); // No API response on network error
  });

  it('should handle invalid response structure', async () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Invalid response.' }];

    mock.onPost('/chat/completions').reply(200, { choices: [] }); // Missing choices[0].message

    await expect(provider.generate(messages)).rejects.toThrow('Invalid response structure from OpenRouter API.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid response structure received'));
  });

  it('should pass generation options to OpenRouter API', async () => {
    const provider = new OpenRouterProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Options test.' }];
    const generationOptions = {
      temperature: 0.8,
      max_tokens: 300,
      stop: ['<|im_end|>'],
    };
    const expectedResponse: any = {
      id: 'chatcmpl-openrouter-test-options',
      object: 'chat.completion',
      created: 1678886400,
      model: mockProviderConfig.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Response with options.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 25, total_tokens: 40 },
    };

    mock.onPost('/chat/completions').reply(200, expectedResponse);

    await provider.generate(messages, generationOptions);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Options test.' }],
      temperature: 0.8,
      max_tokens: 300,
      stop: ['<|im_end|>'],
      stream: false,
    }));
  });
});
