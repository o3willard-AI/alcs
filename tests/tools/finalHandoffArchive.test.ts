import { final_handoff_archive } from '../../src/tools/finalHandoffArchive';
import * as sessionManager from '../../src/sessionManager';
import { StateMachineState, SessionState, Artifact } from '../../src/types/mcp';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';
import * as recommendationService from '../../src/services/recommendationService';

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

// Mock the recommendationService
jest.mock('../../src/services/recommendationService', () => ({
  recommendationService: {
    generateRecommendations: jest.fn().mockResolvedValue([])
  }
}));

describe('final_handoff_archive', () => {
  const mockSessionId = 'test-session-123';
  const mockCodeArtifact: Artifact = { id: 'art-001', type: 'code', description: 'Final code', timestamp: Date.now(), content: 'console.log("hello");' };
  const mockTestArtifact: Artifact = { id: 'art-002', type: 'test_suite', description: 'Unit tests', timestamp: Date.now(), content: 'expect(true).toBe(true);' };
  const mockAuditArtifact: Artifact = { id: 'art-003', type: 'audit_trail', description: 'Event log', timestamp: Date.now(), metadata: { event: 'test_event' } };
  const mockBaseSession: SessionState = {
    session_id: mockSessionId,
    state: StateMachineState.CONVERGED,
    current_iteration: 3,
    last_quality_score: 95,
    artifacts: [mockCodeArtifact, mockTestArtifact, mockAuditArtifact],
    max_iterations: 5,
    quality_threshold: 85,
    elapsed_time_ms: 5000,
    score_history: [70, 85, 95],
    content_hashes: new Set(),
    start_time: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mock to default behavior
    const mockRecommendationService = recommendationService as jest.Mocked<typeof recommendationService>;
    mockRecommendationService.recommendationService.generateRecommendations = jest.fn().mockResolvedValue([]);
  });

  it('should throw an error if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);
    await expect(final_handoff_archive({ session_id: 'not-found' })).rejects.toThrow('Session with ID not-found not found.');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Session with ID not-found not found.'));
  });

  it('should create an archive with the correct artifacts and session data', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const response = await final_handoff_archive({ session_id: mockSessionId });

    expect(response.archive_id).toBe(`archive-${mockSessionId}`);
    expect(response.session_id).toBe(mockSessionId);
    expect(response.final_artifact).toEqual(mockCodeArtifact);
    expect(response.test_suite).toEqual(mockTestArtifact);
    expect(response.final_quality_score).toBe(95);
    expect(response.total_iterations).toBe(3);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Creating archive archive-${mockSessionId} for session ${mockSessionId}`));
  });

  it('should include the audit trail when include_audit is true (default)', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const response = await final_handoff_archive({ session_id: mockSessionId });

    expect(response.audit_trail).toBeDefined();
    expect(response.audit_trail).toHaveLength(1);
    expect(response.audit_trail?.[0]).toEqual({ event: 'test_event' });
  });

  it('should exclude the audit trail when include_audit is false', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const response = await final_handoff_archive({ session_id: mockSessionId, include_audit: false });

    expect(response.audit_trail).toBeUndefined();
  });

  it('should find the latest code and test artifacts', async () => {
    const olderCodeArtifact: Artifact = { id: 'art-000', type: 'code', description: 'Initial code', timestamp: Date.now() - 1000, content: 'var x = 1;' };
    const sessionWithMultipleArtifacts = {
      ...mockBaseSession,
      artifacts: [olderCodeArtifact, mockTestArtifact, mockCodeArtifact],
    };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithMultipleArtifacts);
    
    const response = await final_handoff_archive({ session_id: mockSessionId });

    // It should find the latest code artifact (mockCodeArtifact) due to slice().reverse().find()
    expect(response.final_artifact).toEqual(mockCodeArtifact);
  });

  it('should handle sessions with no test suite or audit trail gracefully', async () => {
    const sessionWithoutExtras = {
      ...mockBaseSession,
      artifacts: [mockCodeArtifact],
    };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithoutExtras);

    const response = await final_handoff_archive({ session_id: mockSessionId });

    expect(response.final_artifact).toEqual(mockCodeArtifact);
    expect(response.test_suite).toBeUndefined();
    expect(response.audit_trail).toBeUndefined();
  });

  it('should log a warning if the session is not in a final state', async () => {
    const sessionInProgress = {
      ...mockBaseSession,
      state: StateMachineState.GENERATING,
    };
    mockedSessionManager.getSessionState.mockReturnValue(sessionInProgress);

    await final_handoff_archive({ session_id: mockSessionId });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`Session ${mockSessionId} is not in a final state`));
  });

  it('should include recommendations in the archive', async () => {
    const mockRecommendations = [
      {
        type: 'trend' as const,
        severity: 'info' as const,
        message: 'Quality improving steadily',
        details: 'Quality score improved by 25.0%. Continue with current approach.',
        actionable: false
      },
      {
        type: 'language' as const,
        severity: 'info' as const,
        message: 'JavaScript best practices',
        details: 'Use const/let instead of var. Prefer arrow functions for callbacks.',
        actionable: true
      }
    ];

    // Mock the recommendationService to return mock recommendations
    const mockRecommendationService = recommendationService as jest.Mocked<typeof recommendationService>;
    mockRecommendationService.recommendationService.generateRecommendations.mockResolvedValue(mockRecommendations);

    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const response = await final_handoff_archive({ session_id: mockSessionId });

    expect(response.recommendations).toBeDefined();
    expect(Array.isArray(response.recommendations)).toBe(true);
    expect(response.recommendations.length).toBe(2);

    // Verify recommendations are formatted with severity emojis
    expect(response.recommendations[0]).toContain('ℹ️');
    expect(response.recommendations[0]).toContain('Quality improving steadily');
    expect(response.recommendations[1]).toContain('JavaScript best practices');

    // Verify the service was called with the session
    expect(mockRecommendationService.recommendationService.generateRecommendations).toHaveBeenCalledWith(mockBaseSession);
  });
});