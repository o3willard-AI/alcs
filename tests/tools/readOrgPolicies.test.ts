import * as fs from 'fs';
import * as path from 'path';
import { PolicyRule } from '../../src/types/mcp';

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock configManager to control policies_path
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      policies_path: '/mock/policies',
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
      log_path: './logs/alcs.log',
      log_level: 'info',
      system_prompts: {
        alpha: { base_prompt: 'You are Agent Alpha' },
        beta: { base_prompt: 'You are Agent Beta' },
      },
    },
  },
}));

// Mock fs module with explicit methods
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

// Import after mocks are set up
import { read_org_policies } from '../../src/tools/readOrgPolicies';
import { logger } from '../../src/services/loggerService';

describe('read_org_policies', () => {
  const mockPoliciesPath = '/mock/policies';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules(); // Important to re-evaluate readOrgPolicies with fresh mocks

    // Default mock behavior
    mockedFs.existsSync.mockReturnValue(false); // No policy files exist by default
    (mockedFs.promises.readFile as jest.Mock).mockClear();
  });

  it('should return default OWASP policies for "security" type if no custom file exists', async () => {
    const response = await read_org_policies({ policy_type: 'security' });

    expect(response.policy_type).toBe('security');
    expect(response.source).toBe('default');
    expect(response.rules.length).toBeGreaterThan(0); // Check that some default rules are returned
    expect(response.rules[0]).toHaveProperty('id');
    expect(response.rules[0]).toHaveProperty('description');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Returning default OWASP Top 10 security policies.'));
    expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join(mockPoliciesPath, 'security-policies.json'));
    expect(mockedFs.promises.readFile).not.toHaveBeenCalled();
  });

  it('should load and parse policies from a custom file if it exists', async () => {
    const customStylePolicies: PolicyRule[] = [
      { id: 'S001', description: 'Max line length 120', severity: 'low', category: 'Style' },
      { id: 'S002', description: 'Use camelCase for variables', severity: 'medium', category: 'Style' },
    ];
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(JSON.stringify(customStylePolicies));

    const response = await read_org_policies({ policy_type: 'style' });

    expect(response.policy_type).toBe('style');
    expect(response.source).toBe('file');
    expect(response.rules).toEqual(customStylePolicies);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Loaded style policies from /mock/policies/style-policies.json'));
    expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join(mockPoliciesPath, 'style-policies.json'));
    expect(mockedFs.promises.readFile).toHaveBeenCalledWith(path.join(mockPoliciesPath, 'style-policies.json'), 'utf-8');
  });

  it('should return default security policies if custom file parsing fails for "security" type', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('{"invalid json"'); // Malformed JSON

    const response = await read_org_policies({ policy_type: 'security' });

    expect(response.policy_type).toBe('security');
    expect(response.source).toBe('default'); // Should fall back to default
    expect(response.rules.length).toBeGreaterThan(0); // Should return OWASP default
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read or parse policy file'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Returning default OWASP Top 10 security policies.'));
  });

  it('should return empty rules for "custom" type if no custom file exists', async () => {
    const response = await read_org_policies({ policy_type: 'custom' });

    expect(response.policy_type).toBe('custom');
    expect(response.source).toBe('default');
    expect(response.rules).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No custom policy file found for custom and no default defined besides security.'));
    expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join(mockPoliciesPath, 'custom-policies.json'));
    expect(mockedFs.promises.readFile).not.toHaveBeenCalled();
  });

  it('should return empty rules for "style" type if custom file parsing fails and no default exists', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue('{"invalid json"'); // Malformed JSON

    const response = await read_org_policies({ policy_type: 'style' });

    expect(response.policy_type).toBe('style');
    expect(response.source).toBe('default'); // Fallback to default behavior (empty)
    expect(response.rules).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read or parse policy file'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('No custom policy file found for style and no default defined besides security.'));
  });
});
