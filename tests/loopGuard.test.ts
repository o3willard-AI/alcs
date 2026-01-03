import { LoopGuard } from '../src/loopGuard';
import { SessionState, LoopGuardConfig } from '../src/types/mcp';
import { StateMachineState } from '../src/types/mcp';
import { logger } from '../src/services/loggerService';
import { createHash } from 'crypto';

// Mock the logger to prevent console output during tests
jest.mock('../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('LoopGuard', () => {
  let mockSession: SessionState;
  let mockConfig: LoopGuardConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = {
      session_id: 'test-session',
      state: StateMachineState.REVISING,
      current_iteration: 0,
      max_iterations: 5,
      quality_threshold: 85,
      artifacts: [],
      score_history: [],
      start_time: Date.now(),
      elapsed_time_ms: 0,
      content_hashes: new Set(),
      task_timeout_minutes: 30,
    };
    mockConfig = {
      stagnationThreshold: 2,
      stagnationWindow: 2,
      oscillationDetection: true,
    };
  });

  it('should return shouldContinue: true when no termination conditions are met', () => {
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue('new content');
    expect(result.shouldContinue).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should terminate due to reaching the iteration cap', () => {
    mockSession.current_iteration = 5;
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('Iteration cap reached');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Iteration cap reached'));
  });

  it('should terminate due to exceeding the task timeout', () => {
    // Set start_time to be 31 minutes in the past
    mockSession.start_time = Date.now() - 31 * 60 * 1000;
    mockSession.task_timeout_minutes = 30;
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('Task timeout exceeded');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Task timeout exceeded'));
  });

  it('should terminate due to score stagnation', () => {
    mockSession.score_history = [70, 71, 71]; // Last two iterations have a delta < 2
    mockConfig.stagnationWindow = 2;
    mockConfig.stagnationThreshold = 2;
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue();
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('Stagnation detected');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Stagnation detected'));
  });

  it('should not terminate for stagnation if score is improving', () => {
    mockSession.score_history = [70, 71, 75]; // Improvement in last iteration
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue();
    expect(result.shouldContinue).toBe(true);
  });

  it('should terminate due to content oscillation', () => {
    const content = 'repeated content';
    const contentHash = createHash('sha256').update(content).digest('hex');
    mockSession.content_hashes.add(contentHash);
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue(content);
    expect(result.shouldContinue).toBe(false);
    expect(result.reason).toContain('Oscillation detected');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Oscillation detected'));
  });

  it('should add new content hash to session if not oscillating', () => {
    const newContent = 'new unique content';
    const newContentHash = createHash('sha256').update(newContent).digest('hex');
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    
    expect(mockSession.content_hashes.has(newContentHash)).toBe(false);
    loopGuard.shouldContinue(newContent);
    expect(mockSession.content_hashes.has(newContentHash)).toBe(true);
  });

  it('should not check for oscillation if disabled in config', () => {
    mockConfig.oscillationDetection = false;
    const content = 'repeated content';
    const contentHash = createHash('sha256').update(content).digest('hex');
    mockSession.content_hashes.add(contentHash);
    const loopGuard = new LoopGuard(mockSession, mockConfig);
    const result = loopGuard.shouldContinue(content);
    expect(result.shouldContinue).toBe(true); // Should not terminate
    // The hash is still added, which is acceptable behavior
    expect(mockSession.content_hashes.size).toBe(1);
  });
});
