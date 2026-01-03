import { ConcurrencyLimiter } from '../../src/utils/concurrencyLimiter';
import { configManager } from '../../src/services/configService';

// Mock configManager to control the concurrency limit and other required properties
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      max_concurrent_requests: 3, // Set a low limit for easy testing
      log_path: './logs/test.log', // Add log_path to prevent logger error
    },
  },
}));

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Use fake timers to control async tasks
jest.useFakeTimers();

// A simple async task that resolves after a delay
const createDelayedTask = (id: number, delay: number) => {
  return jest.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return `Task ${id} result`;
  });
};

describe('ConcurrencyLimiter', () => {
  let limiter: ConcurrencyLimiter;

  beforeEach(() => {
    // We need to re-import the limiter for each test to reset its state,
    // because it's a singleton and we're using jest.resetModules().
    jest.resetModules();
    const { concurrencyLimiter } = require('../../src/utils/concurrencyLimiter');
    limiter = concurrencyLimiter;
  });

  it('should not exceed the max concurrent limit', async () => {
    const tasks = [];
    const maxConcurrent = configManager.config.max_concurrent_requests;

    for (let i = 0; i < maxConcurrent + 2; i++) {
      const task = createDelayedTask(i, 100);
      tasks.push(task);
      limiter.enqueue(task);
    }

    // At no point should the active count exceed the limit
    expect(limiter.getActiveCount()).toBe(maxConcurrent);
    expect(limiter.getQueueSize()).toBe(2);

    // Wait for all tasks to complete
    await jest.runAllTimersAsync();

    expect(limiter.getActiveCount()).toBe(0);
    expect(limiter.getQueueSize()).toBe(0);
    tasks.forEach(task => expect(task).toHaveBeenCalledTimes(1));
  });

  it('should execute tasks in the order they were enqueued', async () => {
    const executionOrder: number[] = [];
    const tasks = [];
    
    for (let i = 0; i < 5; i++) {
      const task = jest.fn(async () => {
        executionOrder.push(i);
        await new Promise(resolve => setTimeout(resolve, 50));
        return `Task ${i}`;
      });
      tasks.push(task);
      limiter.enqueue(task);
    }

    await jest.runAllTimersAsync();
    
    expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
  });

  it('should process the queue as active tasks complete', async () => {
    const maxConcurrent = configManager.config.max_concurrent_requests; // 3
    const tasks: Promise<any>[] = [];

    // Enqueue more tasks than the limit
    for (let i = 0; i < 5; i++) {
      tasks.push(limiter.enqueue(createDelayedTask(i, 100)));
    }

    expect(limiter.getActiveCount()).toBe(maxConcurrent);
    expect(limiter.getQueueSize()).toBe(2);

    // Let the first batch of tasks finish
    await jest.advanceTimersByTimeAsync(100);
    
    // As the first 3 tasks finish, the next 2 should start
    // The activeCount might fluctuate but should settle back down
    // The queue should now be empty and the remaining tasks active
    expect(limiter.getActiveCount()).toBe(2);
    expect(limiter.getQueueSize()).toBe(0);

    // Let the second batch of tasks finish
    await jest.advanceTimersByTimeAsync(100);
    
    expect(limiter.getActiveCount()).toBe(0);
    expect(limiter.getQueueSize()).toBe(0);

    // Ensure all promises resolve
    await Promise.all(tasks);
  });

  it('should handle tasks that reject', async () => {
    const successfulTask = createDelayedTask(1, 50);
    const failingTask = jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      throw new Error('Task failed');
    });
    const anotherSuccessfulTask = createDelayedTask(3, 50);

    const promise1 = limiter.enqueue(successfulTask);
    const promise2 = limiter.enqueue(failingTask).catch(e => e); // Handle rejection immediately
    const promise3 = limiter.enqueue(anotherSuccessfulTask);

    // Let all tasks run
    await jest.runAllTimersAsync();

    await expect(promise1).resolves.toBe('Task 1 result');
    const error = await promise2;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Task failed');
    await expect(promise3).resolves.toBe('Task 3 result');

    expect(limiter.getActiveCount()).toBe(0);
    expect(limiter.getQueueSize()).toBe(0);
  });
});
