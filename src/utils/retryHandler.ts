import { logger } from '../services/loggerService';
import { configManager } from '../services/configService';

/**
 * A simple promise-based sleep function.
 * @param ms The number of milliseconds to sleep.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class EndpointUnavailableError extends Error {
  constructor(context: string, maxDuration: number) {
    super(`Endpoint for ${context} was unavailable after ${maxDuration}ms of retries.`);
    this.name = 'EndpointUnavailableError';
  }
}

/**
 * Executes an async operation with an exponential backoff retry strategy.
 * @param operation The async function to execute.
 * @param context A string describing the operation for logging purposes.
 * @returns A promise that resolves with the result of the operation.
 * @throws An `EndpointUnavailableError` if the operation fails after all retries.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  const maxRetryDuration = configManager.config.retry_ceiling_minutes * 60 * 1000;
  const maxBackoff = 256 * 1000; // 256 seconds
  const baseDelay = 1000; // 1 second

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < maxRetryDuration) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxBackoff);
      
      logger.warn(`Retry ${attempt} for ${context} failed with error: ${error.message}. Waiting ${delay}ms before next attempt.`);
      
      if (Date.now() + delay >= startTime + maxRetryDuration) {
        // Don't wait if the next attempt would exceed the max duration
        break;
      }
      
      await sleep(delay);
    }
  }

  throw new EndpointUnavailableError(context, maxRetryDuration);
}
