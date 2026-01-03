import { handle_escalation } from '../../src/handlers/escalationHandler';
import * as sessionManager from '../../src/sessionManager';
import { logger } from '../../src/services/loggerService';
import { EscalationReason, StateMachineState, SessionState, Artifact, ReviewFeedback } from '../../src/types/mcp';
import { configManager } from '../../src/services/configService';

// Mock all dependencies
jest.mock('../../src/sessionManager');
jest.mock('../../src/services/loggerService');
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      log_path: './logs/test.log', // Added to prevent logger error
    },
  },
}));

const mockedSessionManager = sessionManager as jest.Mocked<typeof sessionManager>;

describe('handle_escalation', () => {
  const mockSessionId = 'test-escalation-session';
  const codeArtifact1: Artifact = { id: 'code-1', type: 'code', content: 'code v1', description: '', timestamp: 0, metadata: { iteration: 1 } };
  const reviewArtifact1: Artifact = { id: 'review-1', type: 'review', content: '{"quality_score": 70}', description: '', timestamp: 0 };
  const codeArtifact2: Artifact = { id: 'code-2', type: 'code', content: 'code v2', description: '', timestamp: 0, metadata: { iteration: 2 } };
  const reviewArtifact2: Artifact = { id: 'review-2', type: 'review', content: '{"quality_score": 60}', description: '', timestamp: 0 };
  
  const mockBaseSession: SessionState = {
    session_id: mockSessionId,
    state: StateMachineState.ESCALATED,
    current_iteration: 2,
    last_quality_score: 60,
    artifacts: [codeArtifact1, reviewArtifact1, codeArtifact2, reviewArtifact2],
    score_history: [70, 60],
    max_iterations: 2,
    quality_threshold: 85,
    start_time: Date.now(),
    elapsed_time_ms: 0,
    content_hashes: new Set(),
    task_timeout_minutes: 30,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw an error if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);
    await expect(handle_escalation('not-found', 'max_iterations_reached')).rejects.toThrow('Session with ID not-found not found.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session with ID not-found not found.'));
  });

  it('should throw an error if no code artifact can be found', async () => {
    const sessionWithNoCode = { ...mockBaseSession, artifacts: [reviewArtifact1, reviewArtifact2] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithNoCode);
    await expect(handle_escalation(mockSessionId, 'max_iterations_reached')).rejects.toThrow('Cannot escalate without a code artifact.');
  });

  it('should identify the best artifact based on the highest score', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const escalationMessage = await handle_escalation(mockSessionId, 'max_iterations_reached');
    
    // score_history is [70, 60], so the best score is 70, which corresponds to the first iteration and codeArtifact1
    expect(escalationMessage.best_artifact).toEqual(codeArtifact1);
  });

  it('should correctly construct the iteration history', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const escalationMessage = await handle_escalation(mockSessionId, 'max_iterations_reached');

    expect(escalationMessage.iteration_history).toEqual([
      { iteration: 1, score: 70, artifact_id: 'code-1' },
      { iteration: 2, score: 60, artifact_id: 'code-2' },
    ]);
  });

  it('should find and parse the final critique from the last review artifact', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const escalationMessage = await handle_escalation(mockSessionId, 'max_iterations_reached');

    expect(escalationMessage.final_critique).toEqual({ quality_score: 60 });
  });

  it('should handle a session with no review artifacts gracefully', async () => {
    const sessionWithNoReviews = { ...mockBaseSession, artifacts: [codeArtifact1, codeArtifact2] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionWithNoReviews);
    const escalationMessage = await handle_escalation(mockSessionId, 'max_iterations_reached');

    expect(escalationMessage.final_critique).toBeDefined();
    expect(escalationMessage.final_critique.quality_score).toBe(60); // Falls back to last_quality_score
    expect(escalationMessage.final_critique.defects).toEqual([]);
  });

  it('should always include available actions', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const escalationMessage = await handle_escalation(mockSessionId, 'max_iterations_reached');

    expect(escalationMessage.available_actions).toHaveLength(4);
    expect(escalationMessage.available_actions.some(a => a.type === 'abort')).toBe(true);
  });

  it('should generate a complete escalation message', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    const reason: EscalationReason = 'stagnation_detected';
    const escalationMessage = await handle_escalation(mockSessionId, reason);

    expect(escalationMessage.session_id).toBe(mockSessionId);
    expect(escalationMessage.reason).toBe(reason);
    expect(escalationMessage.best_artifact).toBeDefined();
    expect(escalationMessage.iteration_history).toBeDefined();
    expect(escalationMessage.final_critique).toBeDefined();
    expect(escalationMessage.available_actions).toBeDefined();
  });
});