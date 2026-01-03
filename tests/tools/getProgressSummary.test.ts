import { get_progress_summary } from '../../src/tools/getProgressSummary';
import * as sessionManager from '../../src/sessionManager';
import { GetProgressSummaryResponse, StateMachineState, SessionState } from '../../src/types/mcp';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';

// Mock configManager and its dependencies
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      default_max_iterations: 5,
      default_quality_threshold: 85,
    },
  },
}));

// Mock the sessionManager module
jest.mock('../../src/sessionManager');
const mockedSessionManager = sessionManager as jest.Mocked<typeof sessionManager>;

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('get_progress_summary', () => {
  const mockSessionId = 'test-session-123';
  const mockBaseSession: SessionState = {
    session_id: mockSessionId,
    state: StateMachineState.REVIEWING,
    current_iteration: 0,
    max_iterations: 5,
    quality_threshold: 85,
    artifacts: [],
    elapsed_time_ms: 5000,
    score_history: [],
    content_hashes: new Set(),
    start_time: Date.now(),
    time_per_iteration_ms: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return a default response if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);

    const response = await get_progress_summary({ session_id: 'not-found-session' });

    expect(response).toEqual({
      session_id: 'not-found-session',
      iterations_completed: 0,
      quality_scores: [],
      time_per_iteration_ms: [],
      current_state: StateMachineState.IDLE,
      convergence_trend: 'insufficient_data',
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Session with ID not-found-session not found.'));
  });

  it('should return convergence_trend "insufficient_data" for short score histories', async () => {
    const sessionWithShortHistory = { ...mockBaseSession, score_history: [70, 75] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithShortHistory);

    const response = await get_progress_summary({ session_id: mockSessionId });

    expect(response.convergence_trend).toBe('insufficient_data');
  });

  it('should return convergence_trend "improving" for consistently increasing scores', async () => {
    const sessionWithImprovingScores = { ...mockBaseSession, score_history: [70, 75, 80] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithImprovingScores);

    const response = await get_progress_summary({ session_id: mockSessionId });

    expect(response.convergence_trend).toBe('improving');
  });

  it('should return convergence_trend "stagnant" for flat scores', async () => {
    const sessionWithStagnantScores = { ...mockBaseSession, score_history: [70, 71, 70] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithStagnantScores);

    const response = await get_progress_summary({ session_id: mockSessionId });

    expect(response.convergence_trend).toBe('stagnant');
  });

  it('should return convergence_trend "oscillating" for up-and-down scores', async () => {
    const sessionWithOscillatingScores = { ...mockBaseSession, score_history: [70, 80, 75] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithOscillatingScores);

    const response = await get_progress_summary({ session_id: mockSessionId });

    expect(response.convergence_trend).toBe('oscillating');
  });

  it('should correctly map session state to the response', async () => {
    const sessionData: SessionState = {
      ...mockBaseSession,
      current_iteration: 3,
      score_history: [70, 75, 80],
      state: StateMachineState.REVISING,
      time_per_iteration_ms: [1000, 1200, 1100],
    };
    mockedSessionManager.getSessionState.mockReturnValue(sessionData);

    const response = await get_progress_summary({ session_id: mockSessionId });

    expect(response).toEqual({
      session_id: mockSessionId,
      iterations_completed: 3,
      quality_scores: [70, 75, 80],
      time_per_iteration_ms: [1000, 1200, 1100],
      current_state: StateMachineState.REVISING,
      convergence_trend: 'improving',
    });
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Generated progress summary for session ${mockSessionId}`));
  });
});