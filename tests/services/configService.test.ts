import fs from 'fs';
import path from 'path';
import { ServerConfig, ProviderConfig } from '../../src/types/config';
import { logger } from '../../src/services/loggerService';
import { AgentType, SystemPromptConfig } from '../../src/types/mcp';

// The path to the module we are testing
const configServicePath = path.resolve(__dirname, '../../src/services/configService.ts');


describe('ConfigManager', () => {
  const validConfig: ServerConfig = {
    deployment_mode: 'workstation',
    max_concurrent_requests: 5,
    context_window: { min: 32000, max: 256000 },
    default_quality_threshold: 85,
    default_max_iterations: 5,
    task_timeout_minutes: 30,
    retry_ceiling_minutes: 10,
    endpoints: {
      alpha: { type: 'ollama', base_url: 'http://localhost:11434', model: 'llama3' },
      beta: { type: 'ollama', base_url: 'http://localhost:11434', model: 'llama3:70b' },
    },
    policies_path: './policies',
    rag_resources_path: undefined,
    log_path: './logs/alcs.log',
    log_level: 'info',
    system_prompts: {
      alpha: {
        base_prompt: 'You are Agent Alpha, an expert software engineer. Your task is to generate high-quality code based on the provided specifications.',
      },
      beta: {
        base_prompt: 'You are Agent Beta, an expert code reviewer. Your task is to review the provided code for quality, correctness, and adherence to policies.',
      },
    },
  };

  const DEFAULT_SERVER_CONFIG_SNAPSHOT: ServerConfig = {
    deployment_mode: 'workstation',
    max_concurrent_requests: 5,
    context_window: {
      min: 32000,
      max: 256000,
    },
    default_quality_threshold: 85,
    default_max_iterations: 5,
    task_timeout_minutes: 30,
    retry_ceiling_minutes: 10,
    endpoints: {
      alpha: {
        type: 'ollama',
        base_url: 'http://localhost:11434',
        model: 'llama3',
      },
      beta: {
        type: 'ollama',
        base_url: 'http://localhost:11434',
        model: 'llama3:70b',
      },
    },
    policies_path: './policies',
    rag_resources_path: undefined,
    log_path: './logs/alcs.log',
    log_level: 'info',
    system_prompts: {
      alpha: {
        base_prompt: 'You are Agent Alpha, an expert software engineer. Your task is to generate high-quality code based on the provided specifications.',
      },
      beta: {
        base_prompt: 'You are Agent Beta, an expert code reviewer. Your task is to review the provided code for quality, correctness, and adherence to policies.',
      },
    },
  };

  beforeEach(() => {
    jest.resetModules();
  });

  it('should load and parse the config.json file correctly', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(validConfig)),
    }));
    jest.doMock('../../src/services/loggerService', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));

    const { configManager } = require(configServicePath);
    expect(configManager.config).toEqual(validConfig);
  });

  it('should return a singleton instance', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(validConfig)),
    }));
    jest.doMock('../../src/services/loggerService', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    const { configManager: instance1 } = require(configServicePath);
    const { configManager: instance2 } = require(configServicePath);
    expect(instance1).toBe(instance2);
  });

  it('should use default configuration if config.json is not found', () => {
    jest.doMock('fs', () => ({ existsSync: jest.fn().mockReturnValue(false) }));
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('../../src/services/loggerService', () => ({ logger: mockLogger }));
    
    const { configManager } = require(configServicePath);
    expect(configManager.config).toEqual(DEFAULT_SERVER_CONFIG_SNAPSHOT);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('config.json not found'));
  });

  it('should use default configuration if config.json is invalid JSON', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue('{"invalid json"}'),
    }));
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('../../src/services/loggerService', () => ({ logger: mockLogger }));
    
    const { configManager } = require(configServicePath);
    expect(configManager.config).toEqual(DEFAULT_SERVER_CONFIG_SNAPSHOT);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read or parse config.json'));
  });

  it('should throw an error for invalid configuration (missing endpoints)', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify({ ...validConfig, endpoints: undefined })),
    }));
    jest.doMock('../../src/services/loggerService', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    expect(() => require(configServicePath)).toThrow('Invalid configuration: Alpha and Beta endpoints must be defined.');
  });

  it('should throw an error for invalid configuration (missing system prompts)', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify({ ...validConfig, system_prompts: undefined })),
    }));
    jest.doMock('../../src/services/loggerService', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    expect(() => require(configServicePath)).toThrow('Invalid configuration: Alpha and Beta system prompts must be defined.');
  });

  it('should allow updating provider configuration for alpha agent', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(validConfig)),
    }));
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('../../src/services/loggerService', () => ({ logger: mockLogger }));
    
    const { configManager } = require(configServicePath);
    const newAlphaConfig: ProviderConfig = {
      type: 'openrouter',
      base_url: 'https://openrouter.ai/api/v1',
      model: 'mistralai/mistral-7b-instruct',
      api_key: 'test-key',
    };

    const previousConfig = configManager.updateProviderConfig('alpha', newAlphaConfig);
    expect(previousConfig).toEqual(validConfig.endpoints.alpha);
    expect(configManager.config.endpoints.alpha).toEqual(newAlphaConfig);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Updated provider config for alpha agent'));
  });
  
  it('should allow updating system prompts for alpha agent', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(validConfig)),
    }));
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('../../src/services/loggerService', () => ({ logger: mockLogger }));

    const { configManager } = require(configServicePath);
    const newAlphaPrompts: SystemPromptConfig = {
      base_prompt: 'You are an advanced code generator.',
      constraints: ['Be concise'],
    };

    const previousPrompts = configManager.updateSystemPrompts('alpha', newAlphaPrompts);
    expect(previousPrompts).toEqual(validConfig.system_prompts.alpha);
    expect(configManager.config.system_prompts.alpha).toEqual(newAlphaPrompts);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Updated system prompts for alpha agent.'));
  });

  it('should allow updating main server configuration', () => {
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue(JSON.stringify(validConfig)),
    }));
    const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    jest.doMock('../../src/services/loggerService', () => ({ logger: mockLogger }));

    const { configManager } = require(configServicePath);
    const newPartialConfig: Partial<ServerConfig> = { max_concurrent_requests: 10 };

    const previousFullConfig = configManager.updateServerConfig(newPartialConfig);
    expect(previousFullConfig).toEqual(validConfig);
    expect(configManager.config.max_concurrent_requests).toBe(10);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Server configuration updated.'));
  });
});
