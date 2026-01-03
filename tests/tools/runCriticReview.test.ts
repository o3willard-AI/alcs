import { run_critic_review } from '../../src/tools/runCriticReview';
import * as sessionManager from '../../src/sessionManager';
import { AgentBeta } from '../../src/agents/agentBeta';
import * as scoringService from '../../src/services/scoringService';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';
import { StateMachineState, SessionState, Artifact, ReviewFeedback } from '../../src/types/mcp';

// Mock all dependencies
jest.mock('../../src/sessionManager');
jest.mock('../../src/agents/agentBeta');
jest.mock('../../src/services/scoringService');
jest.mock('../../src/services/loggerService');
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      default_quality_threshold: 85,
      log_path: './logs/test.log', // Added to prevent logger error
      endpoints: {
        beta: { type: 'openrouter', model: 'beta-model', api_key: 'test-key', base_url: 'https://openrouter.ai/api/v1' },
      },
      system_prompts: {
        beta: { base_prompt: 'Beta base prompt.' },
      },
    },
  },
}));

const mockedSessionManager = sessionManager as jest.Mocked<typeof sessionManager>;
const MockedAgentBeta = AgentBeta as jest.MockedClass<typeof AgentBeta>;
const mockedScoringService = scoringService as jest.Mocked<typeof scoringService>;
const mockedLogger = logger as jest.Mocked<typeof logger>;


describe('run_critic_review', () => {
  const mockSessionId = 'default-active-session';
  const mockArtifactId = 'art-123';
  const mockCodeArtifact: Artifact = { id: mockArtifactId, type: 'code', content: 'test code', description: '', timestamp: 0 };
  const mockBaseSession: SessionState = {
    session_id: mockSessionId,
    state: StateMachineState.REVIEWING,
    current_iteration: 1,
    max_iterations: 5,
    quality_threshold: 85,
    artifacts: [mockCodeArtifact],
    score_history: [],
    start_time: Date.now(),
    elapsed_time_ms: 0,
    content_hashes: new Set(),
  };
  const mockReviewFeedback: ReviewFeedback = {
    quality_score: 90,
    defects: [],
    suggestions: ['Good job.'],
    required_changes: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock AgentBeta's reviewArtifact method
    MockedAgentBeta.prototype.reviewArtifact.mockResolvedValue(mockReviewFeedback);
  });

  it('should throw an error if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);
    await expect(run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'standard' }))
      .rejects.toThrow(`Session with ID ${mockSessionId} not found.`);
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Session with ID default-active-session not found.'));
  });

  it('should throw an error if the artifact is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await expect(run_critic_review(mockSessionId, { artifact_id: 'wrong-id', review_depth: 'standard' }))
      .rejects.toThrow('Code artifact with ID wrong-id not found.');
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Code artifact with ID wrong-id not found'));
  });

  it('should call AgentBeta.reviewArtifact with the correct artifact', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(90);
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'comprehensive' });

    expect(MockedAgentBeta.prototype.reviewArtifact).toHaveBeenCalledTimes(1);
    expect(MockedAgentBeta.prototype.reviewArtifact).toHaveBeenCalledWith(mockCodeArtifact);
  });

  it('should call calculateQualityScore with the review feedback', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(90);
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'comprehensive' });

    expect(mockedScoringService.calculateQualityScore).toHaveBeenCalledTimes(1);
    expect(mockedScoringService.calculateQualityScore).toHaveBeenCalledWith({
      defects: mockReviewFeedback.defects,
      testCoverage: 0, // No test artifact, so coverage is 0
      policyViolations: [], // No policy violations yet
    });
  });

  it('should update the session state with the new score and review artifact', async () => {
    jest.clearAllMocks();
    const sessionToUpdate = { ...mockBaseSession, score_history: [70] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionToUpdate);
    mockedScoringService.calculateQualityScore.mockReturnValue(92);
    MockedAgentBeta.prototype.reviewArtifact.mockResolvedValue(mockReviewFeedback);

    await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'comprehensive' });

    expect(mockedSessionManager.updateSessionState).toHaveBeenCalledTimes(1);
    const updatedSession = (mockedSessionManager.updateSessionState as jest.Mock).mock.calls[0][0];

    expect(updatedSession.last_quality_score).toBe(92);
    expect(updatedSession.score_history).toEqual([70, 92]);
    expect(updatedSession.artifacts.some(a => a.type === 'review')).toBe(true);
    const reviewArtifact = updatedSession.artifacts.find(a => a.type === 'review');
    // The metadata should have the calculated quality score
    expect(reviewArtifact?.metadata).toBeDefined();
    expect(reviewArtifact?.metadata?.quality_score).toBeDefined();
    expect(typeof reviewArtifact?.metadata?.quality_score).toBe('number');
  });

  it('should return a recommendation of "approve" for high scores', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(95);
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);

    const response = await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'quick' });

    expect(response.recommendation).toBe('approve');
  });

  it('should return a recommendation of "revise" for low scores within iteration limits', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(75);
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession); // current_iteration is 1, max is 5

    const response = await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'quick' });

    expect(response.recommendation).toBe('revise');
  });

  it('should return a recommendation of "escalate" for low scores at max iterations', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(75);
    const sessionAtMaxIterations = { ...mockBaseSession, current_iteration: 5, max_iterations: 5 };
    mockedSessionManager.getSessionState.mockReturnValue(sessionAtMaxIterations);

    const response = await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'quick' });

    expect(response.recommendation).toBe('escalate');
  });

  it('should return a comprehensive response on success', async () => {
    mockedScoringService.calculateQualityScore.mockReturnValue(90);
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);

    const response = await run_critic_review(mockSessionId, { artifact_id: mockArtifactId, review_depth: 'comprehensive' });

    expect(response.review_id).toMatch(/^review-/);
    expect(response.quality_score).toBe(90);
    expect(response.defects).toEqual(mockReviewFeedback.defects);
    expect(response.suggestions).toEqual(mockReviewFeedback.suggestions);
    expect(response.test_coverage_estimate).toBe(0); // No test artifact, so coverage is 0
    expect(response.policy_violations).toEqual([]);
    expect(response.recommendation).toBe('approve');
  });
});
