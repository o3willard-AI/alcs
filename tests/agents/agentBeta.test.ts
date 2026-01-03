import { AgentBeta } from '../../src/agents/agentBeta';
import { configManager } from '../../src/services/configService';
import { logger } from '../../src/services/loggerService';
import { OllamaProvider } from '../../src/providers/ollama';
import { LMStudioProvider } from '../../src/providers/lmstudio';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { Artifact, ReviewFeedback } from '../../src/types/mcp';
import { ProviderConfig } from '../../src/types/config';
import { ChatCompletionResponse } from '../../src/types/llm';

// We will use jest.doMock inside beforeEach for all dependencies
const mockGenerate = jest.fn();

describe('AgentBeta', () => {
  const mockCodeArtifact: Artifact = {
    id: 'art-123',
    type: 'code',
    description: 'Test code artifact',
    timestamp: Date.now(),
    content: 'function test() { return 1; }',
  };

  let mockOllamaProvider: jest.Mock;
  let mockLMStudioProvider: jest.Mock;
  let mockOpenRouterProvider: jest.Mock;
  let mockedLogger: typeof logger;


  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGenerate.mockClear();

    // Mock all dependencies using jest.doMock
    jest.doMock('../../src/services/loggerService', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    mockedLogger = require('../../src/services/loggerService').logger;

    mockOllamaProvider = jest.fn(() => ({ name: 'Ollama', generate: mockGenerate }));
    mockLMStudioProvider = jest.fn(() => ({ name: 'LM Studio', generate: mockGenerate }));
    mockOpenRouterProvider = jest.fn(() => ({ name: 'OpenRouter', generate: mockGenerate }));

    jest.doMock('../../src/providers/ollama', () => ({ OllamaProvider: mockOllamaProvider }));
    jest.doMock('../../src/providers/lmstudio', () => ({ LMStudioProvider: mockLMStudioProvider }));
    jest.doMock('../../src/providers/openrouter', () => ({ OpenRouterProvider: mockOpenRouterProvider }));

    jest.doMock('../../src/services/configService', () => ({
      configManager: {
        config: {
          endpoints: {
            alpha: { type: 'ollama', base_url: 'http://localhost:11434', model: 'alpha-model' },
            beta: { type: 'openrouter', base_url: 'https://openrouter.ai/api/v1', model: 'beta-model', api_key: 'test-key' },
          },
          system_prompts: {
            alpha: { base_prompt: 'Alpha base prompt.' },
            beta: { base_prompt: 'Beta base prompt.' },
          },
        },
      },
    }));
  });

  it('should initialize with the provider specified in the config', () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta(); // Constructor reads from configManager
    expect(mockOpenRouterProvider).toHaveBeenCalledTimes(1); // Default config is openrouter
    expect(mockOpenRouterProvider).toHaveBeenCalledWith(require('../../src/services/configService').configManager.config.endpoints.beta);
    expect(mockOllamaProvider).not.toHaveBeenCalled();
  });

  it('should update the provider when updateProvider is called', () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    const newProviderConfig: ProviderConfig = { type: 'lmstudio', base_url: 'http://localhost:1234', model: 'new-beta-model' };
    agentBeta.updateProvider(newProviderConfig);

    expect(mockLMStudioProvider).toHaveBeenCalledTimes(1);
    expect(mockLMStudioProvider).toHaveBeenCalledWith(newProviderConfig);
  });

  it('should format a review prompt correctly', async () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    mockGenerate.mockResolvedValue({ content: '{"quality_score": 0, "defects": []}' } as ChatCompletionResponse);
    await agentBeta.reviewArtifact(mockCodeArtifact);

    const generateCallArgs = mockGenerate.mock.calls[0][0];
    const systemPrompt = generateCallArgs[0].content;

    expect(systemPrompt).toContain('Beta base prompt.');
    expect(systemPrompt).toContain('Your task is to review the following code artifact');
    expect(systemPrompt).toContain('Provide your feedback in a JSON object');
    const expectedCodeBlock = '```\n' + mockCodeArtifact.content + '\n```';
    expect(systemPrompt).toContain(`## Code to Review:
${expectedCodeBlock}`);
  });

  it('should parse a valid JSON response from the LLM', async () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    const mockReview: ReviewFeedback = {
      quality_score: 85,
      defects: [{ severity: 'minor', category: 'style', location: 'line 1', description: 'Missing semicolon', suggested_fix: 'Add a semicolon' }],
      suggestions: ['Consider using a linter.'],
      required_changes: [],
    };
    const mockLLMResponseContent = '```json\n' + JSON.stringify(mockReview, null, 2) + '\n```';
    mockGenerate.mockResolvedValue({ content: mockLLMResponseContent } as ChatCompletionResponse);


    const reviewFeedback = await agentBeta.reviewArtifact(mockCodeArtifact);

    expect(reviewFeedback).toEqual(mockReview);
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully parsed review. Quality Score: 85'));
  });

  it('should handle a malformed JSON response gracefully', async () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    mockGenerate.mockResolvedValue({ content: 'This is not JSON.' } as ChatCompletionResponse);

    const reviewFeedback = await agentBeta.reviewArtifact(mockCodeArtifact);

    expect(reviewFeedback.quality_score).toBe(0);
    expect(reviewFeedback.defects[0].category).toBe('Parsing Error');
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse review from LLM response.'));
  });

  it('should handle a JSON response with missing fields gracefully', async () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    const malformedJson = JSON.stringify({ quality_score: 90, suggestions: [] }); // Missing 'defects'
    mockGenerate.mockResolvedValue({ content: malformedJson } as ChatCompletionResponse);

    const reviewFeedback = await agentBeta.reviewArtifact(mockCodeArtifact);

    expect(reviewFeedback.quality_score).toBe(0);
    expect(reviewFeedback.defects[0].description).toContain('Parsed JSON is missing required fields');
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to parse review from LLM response.'));
  });

  it('should handle LLM generation errors', async () => {
    const { AgentBeta } = require('../../src/agents/agentBeta');
    const agentBeta = new AgentBeta();
    const errorMessage = 'LLM provider failed';
    mockGenerate.mockRejectedValue(new Error(errorMessage));

    // The error should be caught and converted to a default "failed review" object
    // Or it could propagate, depending on desired behavior. Let's assume it propagates for now.
    await expect(agentBeta.reviewArtifact(mockCodeArtifact)).rejects.toThrow(errorMessage);
  });
});
