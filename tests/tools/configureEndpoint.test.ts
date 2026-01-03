import { configure_endpoint } from '../../src/tools/configureEndpoint';
import { AgentType, ConfigureEndpointParams, ConfigureEndpointResponse, HealthCheckResult } from '../../src/types/mcp';
import { ProviderConfig } from '../../src/types/config';
import { configManager } from '../../src/services/configService';
import { logger } from '../../src/services/loggerService';
import { OllamaProvider } from '../../src/providers/ollama';
import { LMStudioProvider } from '../../src/providers/lmstudio';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { LLMProvider, ChatCompletionMessage } from '../../src/types/llm';

// Define mockGenerate globally, as it's a reusable mock method
const mockGenerate = jest.fn();

// We will use jest.doMock inside beforeEach for configManager, loggerService, and providers
// So, remove top-level jest.mock calls for them here.

describe('configure_endpoint', () => {
  const currentAlphaConfig: ProviderConfig = { type: 'ollama', base_url: 'http://old-ollama:11434', model: 'old-llama3' };
  const currentBetaConfig: ProviderConfig = { type: 'lmstudio', base_url: 'http://old-lmstudio:1234', model: 'old-lm-model' };

  let mockedConfigManager: typeof configManager;
  let mockedLogger: typeof logger;
  let mockedOllamaProvider: jest.Mock;
  let mockedLMStudioProvider: jest.Mock;
  let mockedOpenRouterProvider: jest.Mock;


  beforeEach(() => {
    jest.resetModules(); // Important to get fresh modules every time

    // Mock configManager
    jest.doMock('../../src/services/configService', () => ({
      configManager: {
        config: {
          endpoints: {
            alpha: { ...currentAlphaConfig }, // Clone to allow modification in tests if needed
            beta: { ...currentBetaConfig },
          },
        },
        updateProviderConfig: jest.fn(),
      },
    }));
    mockedConfigManager = require('../../src/services/configService').configManager;


    // Mock loggerService
    jest.doMock('../../src/services/loggerService', () => ({
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
    mockedLogger = require('../../src/services/loggerService').logger;


    // Mock LLM Providers - now the jest.doMock factory returns the actual mock function
    mockedOllamaProvider = jest.fn(() => ({ name: 'Ollama', generate: mockGenerate }));
    mockedLMStudioProvider = jest.fn(() => ({ name: 'LM Studio', generate: mockGenerate }));
    mockedOpenRouterProvider = jest.fn(() => ({ name: 'OpenRouter', generate: mockGenerate }));

    jest.doMock('../../src/providers/ollama', () => ({ OllamaProvider: mockedOllamaProvider }));
    jest.doMock('../../src/providers/lmstudio', () => ({ LMStudioProvider: mockedLMStudioProvider }));
    jest.doMock('../../src/providers/openrouter', () => ({ OpenRouterProvider: mockedOpenRouterProvider }));


    // Reset calls on the mockGenerate function
    mockGenerate.mockClear();
  });


  it('should reject invalid provider configuration (missing model)', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const invalidConfig: ProviderConfig = { type: 'ollama', base_url: 'http://localhost:11434' } as ProviderConfig; // Missing model
    const params: ConfigureEndpointParams = { agent: 'alpha', provider: invalidConfig };

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(false);
    expect(response.health_check.status).toBe('degraded');
    expect(response.health_check.message).toContain('Invalid new provider configuration');
    expect(response.previous_config).toEqual(currentAlphaConfig);
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid provider config: Missing type, model, or base_url.'));
    expect(mockedConfigManager.updateProviderConfig).not.toHaveBeenCalled();
  });

  it('should reject unsupported provider types', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const unsupportedConfig: ProviderConfig = { type: 'unknown' as any, base_url: 'http://someurl', model: 'some-model' };
    const params: ConfigureEndpointParams = { agent: 'alpha', provider: unsupportedConfig };

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(false);
    expect(response.health_check.status).toBe('degraded');
    expect(response.health_check.message).toContain('Unsupported provider type: unknown');
    expect(response.previous_config).toEqual(currentAlphaConfig);
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported provider type: unknown'));
    expect(mockedConfigManager.updateProviderConfig).not.toHaveBeenCalled();
  });

  it('should reject OpenRouter config if API key is missing', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const invalidOpenRouterConfig: ProviderConfig = { type: 'openrouter', base_url: 'https://openrouter.ai', model: 'test' }; // Missing api_key
    const params: ConfigureEndpointParams = { agent: 'beta', provider: invalidOpenRouterConfig };

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(false);
    expect(response.health_check.status).toBe('degraded');
    expect(response.health_check.message).toContain('Invalid new provider configuration');
    expect(response.previous_config).toEqual(currentBetaConfig);
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid OpenRouter config: api_key is required.'));
    expect(mockedConfigManager.updateProviderConfig).not.toHaveBeenCalled();
  });

  it('should successfully configure Ollama endpoint if health check passes', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const newOllamaConfig: ProviderConfig = { type: 'ollama', base_url: 'http://new-ollama:11434', model: 'new-llama3' };
    const params: ConfigureEndpointParams = { agent: 'alpha', provider: newOllamaConfig };

    mockGenerate.mockResolvedValueOnce({ content: 'ok', finish_reason: 'stop', model: 'new-llama3' } as ChatCompletionResponse);

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(true);
    expect(response.health_check.status).toBe('ok');
    expect(response.health_check.responseTimeMs).toBeDefined();
    expect(response.previous_config).toEqual(currentAlphaConfig);
    expect(mockedOllamaProvider).toHaveBeenCalledWith(newOllamaConfig);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockedConfigManager.updateProviderConfig).toHaveBeenCalledWith('alpha', newOllamaConfig);
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Health check for Ollama successful'));
    expect(mockedLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully configured alpha endpoint.'));
  });

  it('should not configure endpoint if health check fails', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const newLMStudioConfig: ProviderConfig = { type: 'lmstudio', base_url: 'http://new-lmstudio:1234', model: 'new-lm-model' };
    const params: ConfigureEndpointParams = { agent: 'beta', provider: newLMStudioConfig };

    mockGenerate.mockRejectedValueOnce(new Error('Network error')); // Simulate failed health check

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(false);
    expect(response.health_check.status).toBe('unreachable');
    expect(response.health_check.message).toContain('Network error');
    expect(response.previous_config).toEqual(currentBetaConfig);
    expect(mockedLMStudioProvider).toHaveBeenCalledWith(newLMStudioConfig);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockedConfigManager.updateProviderConfig).not.toHaveBeenCalled();
    expect(mockedLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Health check failed for new beta endpoint.'));
  });

  it('should handle instantiation failure of a new provider', async () => {
    // Re-import configure_endpoint here to ensure it uses the mocks defined in beforeEach
    const { configure_endpoint: reimported_configure_endpoint } = require('../../src/tools/configureEndpoint');

    const faultyConfig: ProviderConfig = { type: 'ollama', base_url: 'http://localhost:11434', model: 'faulty-model' };
    const params: ConfigureEndpointParams = { agent: 'alpha', provider: faultyConfig };

    mockedOllamaProvider.mockImplementationOnce(() => { throw new Error('Bad config leads to instantiation error'); });

    const response = await reimported_configure_endpoint(params);

    expect(response.success).toBe(false);
    expect(response.health_check.status).toBe('degraded');
    expect(response.health_check.message).toContain('Failed to instantiate provider: Bad config leads to instantiation error');
    expect(response.previous_config).toEqual(currentAlphaConfig);
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to instantiate new provider ollama. Error: Bad config leads to instantiation error'));
    expect(mockedConfigManager.updateProviderConfig).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled(); // Health check should not run if instantiation fails
  });
});
