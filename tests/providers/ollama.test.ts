import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';
import { OllamaProvider } from '../../src/providers/ollama';
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

describe('OllamaProvider', () => {
  let mock: MockAdapter;
  const mockProviderConfig: ProviderConfig = {
    type: 'ollama',
    base_url: 'http://localhost:11434',
    model: 'test-model',
  };

  beforeEach(() => {
    mock = new MockAdapter(axios);
    jest.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
  });

  it('should be initialized with the correct config and create an axios client', () => {
    const provider = new OllamaProvider(mockProviderConfig);
    expect(provider.name).toBe('Ollama');
    // Verify base_url was used by axios (indirectly via mock setup)
    // We can't directly check axios instance properties easily, but its usage will be tested via mock
  });

  it('should throw an error if initialized with an incorrect config type', () => {
    const invalidConfig: ProviderConfig = {
      type: 'lmstudio', // Incorrect type
      base_url: 'http://localhost:1234',
      model: 'invalid-model',
    };
    expect(() => new OllamaProvider(invalidConfig)).toThrow('OllamaProvider must be initialized with an OllamaProviderConfig.');
  });

  it('should send a correct request payload and parse a successful response', async () => {
    const provider = new OllamaProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Hello, world!' }];
    const expectedResponse: any = {
      model: 'test-model',
      created_at: '2026-01-01T12:00:00.000Z',
      message: { role: 'assistant', content: 'This is a test response.' },
      done: true,
      total_duration: 12345,
      load_duration: 123,
      prompt_eval_count: 5,
      eval_count: 10,
    };

    mock.onPost('/chat').reply(200, expectedResponse);

    const result = await provider.generate(messages);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Hello, world!' }],
      options: {
        temperature: undefined,
        num_predict: undefined,
        stop: undefined,
      },
      stream: false,
    }));

    const expectedChatCompletionResponse: ChatCompletionResponse = {
      content: 'This is a test response.',
      finish_reason: 'stop',
      model: 'test-model',
      prompt_eval_count: 5,
      eval_count: 10,
      total_duration: 12345,
    };
    expect(result).toEqual(expectedChatCompletionResponse);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Generating completion for model test-model'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Completion generated (model: test-model, eval_count: 10)'));
  });

  it('should handle API errors and throw a custom error message', async () => {
    const provider = new OllamaProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Error test.' }];
    const errorMessage = 'Internal server error';

    mock.onPost('/chat').reply(500, { error: errorMessage });

    await expect(provider.generate(messages)).rejects.toThrow(`Ollama API error: 500 - ${errorMessage}`);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model test-model'));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`API Response error: {"error":"${errorMessage}"}`));
  });

  it('should handle network errors and throw a generic error message', async () => {
    const provider = new OllamaProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Network error test.' }];

    mock.onPost('/chat').networkError();

    await expect(provider.generate(messages)).rejects.toThrow('Failed to generate completion from Ollama API: Network Error');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('API call failed for model test-model'));
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('API Response error')); // No API response on network error
  });

  it('should handle invalid response structure', async () => {
    const provider = new OllamaProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Invalid response.' }];

    mock.onPost('/chat').reply(200, { model: 'test-model', done: true, message: {} }); // Missing message.content

    await expect(provider.generate(messages)).rejects.toThrow('Invalid response structure from Ollama API.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid response structure received'));
  });

  it('should pass generation options to Ollama API', async () => {
    const provider = new OllamaProvider(mockProviderConfig);
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: 'Options test.' }];
    const generationOptions = {
      temperature: 0.5,
      max_tokens: 100,
      stop: ['\n'],
    };
    const expectedResponse: any = {
      model: 'test-model',
      message: { role: 'assistant', content: 'Response with options.' },
      done: true,
    };

    mock.onPost('/chat').reply(200, expectedResponse);

    await provider.generate(messages, generationOptions);

    expect(mock.history.post[0].data).toEqual(JSON.stringify({
      model: mockProviderConfig.model,
      messages: [{ role: 'user', content: 'Options test.' }],
      options: {
        temperature: 0.5,
        num_predict: 100,
        stop: ['\n'],
      },
      stream: false,
    }));
  });
});
