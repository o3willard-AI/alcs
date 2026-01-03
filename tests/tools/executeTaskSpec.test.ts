import { execute_task_spec, ExecuteTaskSpecParams, ExecuteTaskSpecResponse } from '../../src/tools/executeTaskSpec';
import { TaskSpec } from '../../src/types/mcp';
import { logger } from '../../src/services/loggerService';

// Mock the logger to prevent console output during tests and inspect calls
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('execute_task_spec', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
  });

  it('should reject a task with a missing description', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        language: 'TypeScript',
      } as TaskSpec, // Cast to TaskSpec, as description is intentionally missing
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('rejected');
    expect(response.rejection_reason).toBe('Task description is required and cannot be empty.');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing or invalid description'));
  });

  it('should reject a task with an empty description', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        description: '  ',
        language: 'TypeScript',
      },
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('rejected');
    expect(response.rejection_reason).toBe('Task description is required and cannot be empty.');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing or invalid description'));
  });

  it('should reject a task with a missing language', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        description: 'Implement a user authentication module',
      } as TaskSpec, // Cast to TaskSpec, as language is intentionally missing
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('rejected');
    expect(response.rejection_reason).toBe('Task language is required and cannot be empty.');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing or invalid language'));
  });

  it('should reject a task with an empty language', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        description: 'Implement a user authentication module',
        language: '  ',
      },
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('rejected');
    expect(response.rejection_reason).toBe('Task language is required and cannot be empty.');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing or invalid language'));
  });

  it('should accept a valid task and return an accepted status with a session ID', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        description: 'Implement a user authentication module',
        language: 'TypeScript',
      },
      max_iterations: 3,
      quality_threshold: 90,
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('accepted');
    expect(response.session_id).toMatch(/^session-\d{13}-[a-z0-9]+$/); // Regex for basic session ID format
    expect(response.estimated_duration_ms).toBe(30 * 60 * 1000);
    expect(response.rejection_reason).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Task accepted.'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Description - "Implement a user authentication module"'));
  });

  it('should use default values for max_iterations and quality_threshold if not provided', async () => {
    const params: ExecuteTaskSpecParams = {
      spec: {
        description: 'Refactor old code',
        language: 'Python',
      },
    };

    const response = await execute_task_spec(params);

    expect(response.status).toBe('accepted');
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Max Iterations - 5')); // Default value
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Quality Threshold - 85')); // Default value
  });
});
