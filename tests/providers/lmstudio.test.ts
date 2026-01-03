import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { LMStudioProvider } from '../../src/providers/lmstudio';
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

describe('LMStudioProvider', () => {
  let mock: MockAdapter;
  const mockProviderConfig: ProviderConfig = {
    type: 'lmstudio',
    base_url: 'http://localhost:1234',
    model: 'lmstudio-community/test-model',
  };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should be initialized with the correct config and create an axios client', () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    expect(provider.name).toBe('LM Studio');
    // axios client's baseURL is internal, implicitly tested via mock.onPost
  });

  it('should throw an error if initialized with an incorrect config type', () => {
    const invalidConfig: ProviderConfig = {
      type: 'ollama', // Incorrect type
      base_url: 'http://localhost:1234',
      model: 'invalid-model',
    };
    expect(() => new LMStudioProvider(invalidConfig)).toThrow('LMStudioProvider must be initialized with an LMStudioProviderConfig.');
  });

  it('should send a correct request payload and parse a successful response', async () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Hello, LM Studio!' }];
    const expectedResponse: any = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1678886400,
      model: mockProviderConfig.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'This is a test response from LM Studio.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };

    mock.onPost('/chat/completions').reply(200, expectedResponse);

    const result = await provider.generate(messages);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Hello, LM Studio!' }],
      temperature: undefined,
      max_tokens: undefined,
      stop: undefined,
      stream: false,
    }));

    const expectedChatCompletionResponse: ChatCompletionResponse = {
      content: 'This is a test response from LM Studio.',
      finish_reason: 'stop',
      model: mockProviderConfig.model,
    };
    expect(result).toEqual(expectedChatCompletionResponse);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Generating completion for model lmstudio-community/test-model'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Completion generated (model: lmstudio-community/test-model, finish_reason: stop)'));
  });

  it('should handle API errors and throw a custom error message', async () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Error test.' }];
    const errorMessage = 'Internal server error';

    mock.onPost('/chat/completions').reply(500, { error: { message: errorMessage } });

    await expect(provider.generate(messages)).rejects.toThrow(`LM Studio API error: 500 - ${errorMessage}`);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model lmstudio-community/test-model'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`API Response error: {"error":{"message":"${errorMessage}"}}`));
  });

  it('should handle network errors and throw a generic error message', async () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Network error test.' }];

    mock.onPost('/chat/completions').networkError();

    await expect(provider.generate(messages)).rejects.toThrow('Failed to generate completion from LM Studio API: Network Error');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model lmstudio-community/test-model'));
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('API Response error')); // No API response on network error
  });

  it('should handle invalid response structure', async () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Invalid response.' }];

    mock.onPost('/chat/completions').reply(200, { choices: [] }); // Missing choices[0].message

    await expect(provider.generate(messages)).rejects.toThrow('Invalid response structure from LM Studio API.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid response structure received'));
  });

  it('should pass generation options to LM Studio API', async () => {
    const provider = new LMStudioProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Options test.' }];
    const generationOptions = {
      temperature: 0.7,
      max_tokens: 200,
      stop: ['\n'],
    };
    const expectedResponse: any = {
      id: 'chatcmpl-test-options',
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
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };

    mock.onPost('/chat/completions').reply(200, expectedResponse);

    await provider.generate(messages, generationOptions);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Options test.' }],
      temperature: 0.7,
      max_tokens: 200,
      stop: ['\n'],
      stream: false,
    }));
  });
});
