import { get_project_status } from '../../src/tools/getProjectStatus';
import * as sessionManager from '../../src/sessionManager';
import { StateMachineState, SessionState } from '../../src/types/mcp';
import { AppConfig } from '../../src/services/configService';
import { logger } from '../../src/services/loggerService';

// Mock the sessionManager module
jest.mock('../../src/sessionManager', () => ({
  createSessionState: jest.fn(),
  getSessionState: jest.fn(),
  updateSessionState: jest.fn(), // Not directly tested by get_project_status, but good to mock
  deleteSessionState: jest.fn(), // Not directly tested by get_project_status, but good to mock
  clearAllSessions: jest.fn(),
}));

// Mock AppConfig to control default values
jest.mock('../../src/services/configService', () => ({
  AppConfig: {
    default_max_iterations: 5,
    default_quality_threshold: 85,
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

describe('get_project_status', () => {
  const mockDefaultSessionId = 'default-active-session';
  const mockExistingSessionId = 'test-session-123';
  const mockSessionState: SessionState = {
    session_id: mockExistingSessionId,
    state: StateMachineState.GENERATING,
    current_iteration: 2,
    max_iterations: 5,
    quality_threshold: 85,
    artifacts: [],
    elapsed_time_ms: 10000,
    score_history: [],
    content_hashes: new Set(),
    start_time: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (sessionManager.clearAllSessions as jest.Mock).mockClear(); // Clear any existing sessions from previous test runs

    // Default mock implementation for sessionManager
    (sessionManager.getSessionState as jest.Mock).mockReturnValue(undefined);
    (sessionManager.createSessionState as jest.Mock).mockImplementation((id: string) => ({
      session_id: id,
      state: StateMachineState.IDLE,
      current_iteration: 0,
      max_iterations: AppConfig.default_max_iterations,
      quality_threshold: AppConfig.default_quality_threshold,
      artifacts: [],
      elapsed_time_ms: 0,
      score_history: [],
      content_hashes: new Set(),
      start_time: Date.now(),
    }));
  });

  it('should return a new default session if no session_id is provided and no default session exists', async () => {
    const response = await get_project_status();

    expect(sessionManager.getSessionState).toHaveBeenCalledWith(mockDefaultSessionId);
    expect(sessionManager.createSessionState).toHaveBeenCalledWith(mockDefaultSessionId);
    expect(response.session_id).toBe(mockDefaultSessionId);
    expect(response.state).toBe(StateMachineState.IDLE);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('creating a default active session.'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Retrieved status for session ${mockDefaultSessionId}`));
  });

  it('should return the existing default session if no session_id is provided and a default session exists', async () => {
    (sessionManager.getSessionState as jest.Mock).mockImplementationOnce((id: string) => {
      if (id === mockDefaultSessionId) return { ...mockSessionState, session_id: mockDefaultSessionId, state: StateMachineState.CONVERGED };
      return undefined;
    });

    const response = await get_project_status();

    expect(sessionManager.getSessionState).toHaveBeenCalledWith(mockDefaultSessionId);
    expect(sessionManager.createSessionState).not.toHaveBeenCalled();
    expect(response.session_id).toBe(mockDefaultSessionId);
    expect(response.state).toBe(StateMachineState.CONVERGED);
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('creating a default active session.'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Retrieved status for session ${mockDefaultSessionId}`));
  });

  it('should return a found session if a session_id is provided and the session exists', async () => {
    (sessionManager.getSessionState as jest.Mock).mockReturnValue(mockSessionState);

    const response = await get_project_status({ session_id: mockExistingSessionId });

    expect(sessionManager.getSessionState).toHaveBeenCalledWith(mockExistingSessionId);
    expect(sessionManager.createSessionState).not.toHaveBeenCalled();
    expect(response.session_id).toBe(mockExistingSessionId);
    expect(response.state).toBe(StateMachineState.GENERATING);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Retrieved status for session ${mockExistingSessionId}`));
  });

  it('should create a "temp" session if a session_id is provided but the session does not exist', async () => {
    const nonExistentSessionId = 'non-existent-session';
    const expectedTempSessionId = `temp-${nonExistentSessionId}`;

    const response = await get_project_status({ session_id: nonExistentSessionId });

    expect(sessionManager.getSessionState).toHaveBeenCalledWith(nonExistentSessionId);
    expect(sessionManager.createSessionState).toHaveBeenCalledWith(expectedTempSessionId);
    expect(response.session_id).toBe(expectedTempSessionId);
    expect(response.state).toBe(StateMachineState.IDLE);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Session with ID ${nonExistentSessionId} not found.`));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Retrieved status for session ${expectedTempSessionId}`));
  });
});
