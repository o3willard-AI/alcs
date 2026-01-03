import { executeWithRetry, EndpointUnavailableError } from '../../src/utils/retryHandler';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';

// Mock all dependencies
jest.mock('../../src/services/loggerService');
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      retry_ceiling_minutes: 0.1, // Use a short duration for tests (0.1 min = 6 seconds)
      log_path: './logs/test.log', // Add log_path to prevent logger error
    },
  },
}));

describe('executeWithRetry', () => {
  const mockOperation = jest.fn();
  const context = 'Test Operation';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01'));
    jest.clearAllMocks();
    mockOperation.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return the result on the first successful attempt', async () => {
    const successResult = { data: 'success' };
    mockOperation.mockResolvedValueOnce(successResult);

    const result = await executeWithRetry(mockOperation, context);

    expect(result).toEqual(successResult);
    expect(mockOperation).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should retry the operation on failure and succeed on the second attempt', async () => {
    const successResult = { data: 'success' };
    mockOperation
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce(successResult);

    const promise = executeWithRetry(mockOperation, context);

    // Advance timers to allow the retry delay to pass
    await jest.advanceTimersByTimeAsync(1000); // 1s delay after first failure

    const result = await promise;

    expect(result).toEqual(successResult);
    expect(mockOperation).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Retry 1 for Test Operation failed'));
  });

  it('should throw an EndpointUnavailableError after exhausting all retries', async () => {
    mockOperation.mockRejectedValue(new Error('Persistent failure'));

    const promise = executeWithRetry(mockOperation, context).catch(e => e);

    // Advance time past the retry ceiling (6000ms)
    await jest.advanceTimersByTimeAsync(7000);

    const error = await promise;
    expect(error).toBeInstanceOf(EndpointUnavailableError);
    expect(error.message).toContain('Test Operation');
  });

  it('should follow an exponential backoff delay pattern and succeed', async () => {
    mockOperation
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockResolvedValueOnce({ data: 'success' });

    const promise = executeWithRetry(mockOperation, context);

    // Advance through retries within the 6000ms ceiling
    await jest.advanceTimersByTimeAsync(1000); // After 1st failure (1s backoff)
    await jest.advanceTimersByTimeAsync(2000); // After 2nd failure (2s backoff)

    const result = await promise;
    expect(result).toEqual({ data: 'success' });
    expect(mockOperation).toHaveBeenCalledTimes(3);
  });
});