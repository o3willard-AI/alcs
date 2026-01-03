import { logger } from '../services/loggerService';
import { configManager } from '../services/configService';

type AsyncTask<T> = () => Promise<T>;

export class ConcurrencyLimiter {
  private maxConcurrent: number;
  private activeCount: number = 0;
  private queue: { task: AsyncTask<any>; resolve: (value: any) => void; reject: (reason?: any) => void }[] = [];

  constructor() {
    this.maxConcurrent = configManager.config.max_concurrent_requests;
    logger.info(`ConcurrencyLimiter initialized with a limit of ${this.maxConcurrent} requests.`);
  }

  /**
   * Enqueues an async task to be executed, respecting the concurrency limit.
   * @param task The async function to execute.
   * @returns A promise that resolves or rejects with the result of the task.
   */
  public enqueue<T>(task: AsyncTask<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    // If the queue is empty or we are at the concurrency limit, do nothing.
    if (this.queue.length === 0 || this.activeCount >= this.maxConcurrent) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift()!;
    this.activeCount++;
    logger.debug(`Starting new task. Active tasks: ${this.activeCount}`);

    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.activeCount--;
        logger.debug(`Task finished. Active tasks: ${this.activeCount}`);
        // After a task finishes, try to process the next one in the queue.
        this.processQueue();
      });
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public getQueueSize(): number {
    return this.queue.length;
  }
}

// Export a singleton instance for global use
export const concurrencyLimiter = new ConcurrencyLimiter();
