import { generate_test_suite } from '../../src/tools/generateTestSuite';
import * as sessionManager from '../../src/sessionManager';
import { AgentBeta } from '../../src/agents/agentBeta';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';
import { StateMachineState, SessionState, Artifact, TestFramework } from '../../src/types/mcp';

// Mock all dependencies
jest.mock('../../src/sessionManager');
jest.mock('../../src/agents/agentBeta');
jest.mock('../../src/services/loggerService');
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
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

describe('generate_test_suite', () => {
  const mockSessionId = 'default-active-session';
  const mockArtifactId = 'art-123';
  const mockCodeArtifact: Artifact = { id: mockArtifactId, type: 'code', content: 'function add(a, b) { return a + b; }', description: '', timestamp: 0 };
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
  const mockTestCode = `
    it('should add two numbers', () => {
      expect(add(1, 2)).toBe(3);
    });
    it('should handle negative numbers', () => {
      expect(add(-1, -1)).toBe(-2);
    });
  `;

  beforeEach(() => {
    jest.clearAllMocks();
    MockedAgentBeta.prototype.generateTestSuite.mockResolvedValue(mockTestCode);
  });

  it('should throw an error if the session is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(undefined);
    await expect(generate_test_suite({ artifact_id: mockArtifactId, framework: 'jest' }))
      .rejects.toThrow(`Session with ID ${mockSessionId} not found.`);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Session with ID default-active-session not found.'));
  });

  it('should throw an error if the artifact is not found', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await expect(generate_test_suite({ artifact_id: 'wrong-id', framework: 'jest' }))
      .rejects.toThrow('Code artifact with ID wrong-id not found.');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Code artifact with ID wrong-id not found'));
  });

  it('should call AgentBeta.generateTestSuite with the correct parameters', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);
    await generate_test_suite({ artifact_id: mockArtifactId, framework: 'jest', coverage_target: 90 });

    expect(MockedAgentBeta.prototype.generateTestSuite).toHaveBeenCalledTimes(1);
    expect(MockedAgentBeta.prototype.generateTestSuite).toHaveBeenCalledWith(mockCodeArtifact, 'jest', 90);
  });

  it('should create and add a test_suite artifact to the session', async () => {
    const sessionToUpdate = { ...mockBaseSession, artifacts: [mockCodeArtifact] };
    mockedSessionManager.getSessionState.mockReturnValue(sessionToUpdate);

    await generate_test_suite({ artifact_id: mockArtifactId, framework: 'jest' });

    expect(mockedSessionManager.updateSessionState).toHaveBeenCalledTimes(1);
    const updatedSession = (mockedSessionManager.updateSessionState as jest.Mock).mock.calls[0][0];

    expect(updatedSession.artifacts.length).toBe(2);
    const testArtifact = updatedSession.artifacts.find(a => a.type === 'test_suite');
    expect(testArtifact).toBeDefined();
    expect(testArtifact?.content).toBe(mockTestCode);
    expect(testArtifact?.metadata?.framework).toBe('jest');
    expect(testArtifact?.metadata?.test_count).toBe(2);
  });

  it('should return a comprehensive response on success', async () => {
    mockedSessionManager.getSessionState.mockReturnValue(mockBaseSession);

    const response = await generate_test_suite({ artifact_id: mockArtifactId, framework: 'pytest' });

    expect(response.test_artifact_id).toMatch(/^test-/);
    expect(response.test_code).toBe(mockTestCode);
    expect(response.test_count).toBe(2);
    expect(response.estimated_coverage).toBe(85); // Mocked value from the tool
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Test suite generated for artifact ${mockArtifactId}. Test count: 2.`));
  });
});