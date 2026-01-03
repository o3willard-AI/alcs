import { set_system_prompts } from '../../src/tools/setSystemPrompts';
import { AgentType, SetSystemPromptsParams, SystemPromptConfig } from '../../src/types/mcp';
import { configManager } from '../../src/services/configService';
import { logger } from '../../src/services/loggerService';

// Mock all external dependencies
jest.mock('../../src/services/configService', () => ({
  configManager: {
    updateSystemPrompts: jest.fn(),
  },
}));

jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedConfigManager = configManager as jest.Mocked<typeof configManager>;

describe('set_system_prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject if prompts object is missing', async () => {
    const params: SetSystemPromptsParams = {
      agent: 'alpha',
      prompts: undefined as any, // Intentionally invalid
    };

    const response = await set_system_prompts(params);

    expect(response.success).toBe(false);
    expect(response.message).toContain('`base_prompt` is required');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid prompts object'));
    expect(mockedConfigManager.updateSystemPrompts).not.toHaveBeenCalled();
  });

  it('should reject if base_prompt is missing or empty', async () => {
    const params: SetSystemPromptsParams = {
      agent: 'alpha',
      prompts: {
        base_prompt: '   ', // Empty string
      },
    };

    const response = await set_system_prompts(params);

    expect(response.success).toBe(false);
    expect(response.message).toContain('`base_prompt` is required');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid prompts object'));
    expect(mockedConfigManager.updateSystemPrompts).not.toHaveBeenCalled();
  });

  it('should successfully update system prompts for alpha agent', async () => {
    const newAlphaPrompts: SystemPromptConfig = {
      base_prompt: 'You are a helpful assistant for Alpha.',
      constraints: ['Be very concise.'],
    };
    const previousPrompts: SystemPromptConfig = {
      base_prompt: 'Old alpha prompt.',
    };
    const params: SetSystemPromptsParams = {
      agent: 'alpha',
      prompts: newAlphaPrompts,
    };
    mockedConfigManager.updateSystemPrompts.mockReturnValue(previousPrompts);

    const response = await set_system_prompts(params);

    expect(response.success).toBe(true);
    expect(response.previous_prompts).toEqual(previousPrompts);
    expect(response.message).toBeUndefined();
    expect(mockedConfigManager.updateSystemPrompts).toHaveBeenCalledWith('alpha', newAlphaPrompts);
    expect(mockedConfigManager.updateSystemPrompts).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("System prompts for agent 'alpha' have been updated."));
  });

  it('should successfully update system prompts for beta agent', async () => {
    const newBetaPrompts: SystemPromptConfig = {
      base_prompt: 'You are a helpful assistant for Beta.',
      output_format: 'JSON',
    };
    const previousPrompts: SystemPromptConfig = {
      base_prompt: 'Old beta prompt.',
    };
    const params: SetSystemPromptsParams = {
      agent: 'beta',
      prompts: newBetaPrompts,
    };
    mockedConfigManager.updateSystemPrompts.mockReturnValue(previousPrompts);

    const response = await set_system_prompts(params);

    expect(response.success).toBe(true);
    expect(response.previous_prompts).toEqual(previousPrompts);
    expect(response.message).toBeUndefined();
    expect(mockedConfigManager.updateSystemPrompts).toHaveBeenCalledWith('beta', newBetaPrompts);
    expect(mockedConfigManager.updateSystemPrompts).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("System prompts for agent 'beta' have been updated."));
  });

  it('should handle errors from configManager and return a failure response', async () => {
    const newPrompts: SystemPromptConfig = {
      base_prompt: 'This will fail.',
    };
    const params: SetSystemPromptsParams = {
      agent: 'alpha',
      prompts: newPrompts,
    };
    const errorMessage = 'Something went wrong';
    mockedConfigManager.updateSystemPrompts.mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const response = await set_system_prompts(params);

    expect(response.success).toBe(false);
    expect(response.message).toContain(errorMessage);
    expect(response.previous_prompts).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to update system prompts for agent 'alpha'. Error: ${errorMessage}`));
  });
});
