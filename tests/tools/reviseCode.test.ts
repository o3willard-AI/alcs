import { revise_code } from '../../src/tools/reviseCode';
import * as sessionManager from '../../src/sessionManager';
import { AgentAlpha } from '../../src/agents/agentAlpha';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';
import { StateMachineState, SessionState, Artifact, ReviewFeedback } from '../../src/types/mcp';

// Mock all dependencies
jest.mock('../../src/sessionManager');
jest.mock('../../src/agents/agentAlpha');
jest.mock('../../src/services/loggerService');
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      log_path: './logs/test.log', // Added to prevent logger error
      endpoints: {
        alpha: { type: 'ollama', base_url: 'http://localhost:11434', model: 'alpha-model' },
      },
      system_prompts: {
        alpha: { base_prompt: 'Alpha base prompt.' },
      },
    },
  },
}));

const mockedSessionManager = sessionManager as jest.Mocked<typeof sessionManager>;
const MockedAgentAlpha = AgentAlpha as jest.MockedClass<typeof AgentAlpha>;

describe('revise_code', () => {
  const mockSessionId = 'default-active-session';
  const mockArtifactId = 'art-123';
  const mockCodeArtifact: Artifact = { id: mockArtifactId, type: 'code', content: 'original code', description: '', timestamp: 0 };
  const mockBaseSession: SessionState = {
    session_id: mockSessionId,
    state: StateMachineState.REVISING,
    current_iteration: 1,
    max_iterations: 5,
    quality_threshold: 85,
    artifacts: [mockCodeArtifact],
    score_history: [],
    start_time: Date.now(),
    elapsed_time_ms: 0,
    content_hashes: new Set(),
  };
  const mockFeedback: ReviewFeedback = {
    quality_score: 70,
    defects: [{ severity: 'major', category: 'bug', location: 'line 5', description: 'Off-by-one error' }],
    suggestions: [],
    required_changes: ['Fix the off-by-one error.'],
  };
  const mockRevisedCode = 'revised code';

  beforeEach(() => {
    jest.clearAllMocks();
    MockedAgentAlpha.prototype.revise.mockResolvedValue(mockRevisedCode);
  });

  it('should throw an error if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);
    await expect(revise_code({ artifact_id: mockArtifactId, feedback: mockFeedback }))
      .rejects.toThrow(`Session with ID ${mockSessionId} not found.`);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session with ID default-active-session not found.'));
  });

  it('should throw an error if the artifact is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await expect(revise_code({ artifact_id: 'wrong-id', feedback: mockFeedback }))
      .rejects.toThrow('Code artifact with ID wrong-id not found.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Code artifact with ID wrong-id not found'));
  });

  it('should call AgentAlpha.revise with the correct artifact and feedback', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await revise_code({ artifact_id: mockArtifactId, feedback: mockFeedback });

    expect(MockedAgentAlpha.prototype.revise).toHaveBeenCalledTimes(1);
    expect(MockedAgentAlpha.prototype.revise).toHaveBeenCalledWith(mockCodeArtifact, mockFeedback);
  });

  it('should create and add a new code artifact to the session', async () => {
    const sessionToUpdate = { ...mockBaseSession, artifacts: [mockCodeArtifact] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionToUpdate);

    await revise_code({ artifact_id: mockArtifactId, feedback: mockFeedback });

    expect(mockedSessionManager.updateSessionState).toHaveBeenCalledTimes(1);
    const updatedSession = (mockedSessionManager.updateSessionState as jest.Mock).mock.calls[0][0];

    expect(updatedSession.artifacts.length).toBe(2);
    const newArtifact = updatedSession.artifacts.find(a => a.id !== mockArtifactId);
    expect(newArtifact).toBeDefined();
    expect(newArtifact?.type).toBe('code');
    expect(newArtifact?.content).toBe(mockRevisedCode);
    expect(newArtifact?.metadata?.original_artifact_id).toBe(mockArtifactId);
  });

  it('should return the new artifact on success', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);

    const newArtifact = await revise_code({ artifact_id: mockArtifactId, feedback: mockFeedback });

    expect(newArtifact.type).toBe('code');
    expect(newArtifact.content).toBe(mockRevisedCode);
    expect(newArtifact.id).toMatch(/^code-/);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Revision complete. New artifact ID: ${newArtifact.id}`));
  });
});