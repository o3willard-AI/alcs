import { inject_alternative_pattern } from '../../src/tools/injectAlternativePattern';
import { CodePattern } from '../../src/types/mcp';
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

describe('inject_alternative_pattern', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should acknowledge the pattern and return a success message', async () => {
    const mockPattern: CodePattern = {
      name: 'Singleton',
      description: 'Ensures a class has only one instance.',
      template: 'class Singleton { ... }',
    };
    const mockContext = 'The current implementation has thread-safety issues.';

    const response = await inject_alternative_pattern({ pattern: mockPattern, context: mockContext });

    expect(response.success).toBe(true);
    expect(response.message).toContain('Pattern "Singleton" acknowledged.');
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Received pattern "Singleton"'));
  });
});
