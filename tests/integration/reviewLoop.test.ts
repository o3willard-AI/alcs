import { StateMachine } from '../../src/stateMachine';
import { AgentAlpha } from '../../src/agents/agentAlpha';
import { AgentBeta } from '../../src/agents/agentBeta';
import { LoopGuard } from '../../src/loopGuard';
import { SessionState, StateMachineState, ReviewFeedback, Artifact } from '../../src/types/mcp';
import { logger } from '../../src/services/loggerService';
import { configManager } from '../../src/services/configService';
import { calculateQualityScore } from '../../src/services/scoringService';
import * as sessionManager from '../../src/sessionManager';

// Mock all external dependencies
jest.mock('../../src/services/loggerService');

// Mock providers to avoid actual LLM calls
const mockAlphaGenerate = jest.fn();
const mockAlphaRevise = jest.fn();
jest.mock('../../src/agents/agentAlpha', () => {
  return {
    AgentAlpha: jest.fn().mockImplementation(() => {
      return {
        generate: mockAlphaGenerate,
        revise: mockAlphaRevise,
      };
    }),
  };
});

const mockBetaReview = jest.fn();
jest.mock('../../src/agents/agentBeta', () => {
  return {
    AgentBeta: jest.fn().mockImplementation(() => {
      return {
        reviewArtifact: mockBetaReview,
      };
    }),
  };
});

// Mock database service to avoid needing real database
const mockPrismaClient = {
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  artifact: {
    create: jest.fn(),
  },
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  $on: jest.fn(),
};

jest.mock('../../src/services/databaseService', () => ({
  dbService: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getClient: jest.fn(() => mockPrismaClient),
    isDbConnected: jest.fn(() => true),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

// We need a non-mocked session manager for this test
jest.unmock('../../src/sessionManager');
const { createSessionState, getSessionState, updateSessionState, clearAllSessions } = jest.requireActual('../../src/sessionManager');
jest.unmock('../../src/services/scoringService'); // Unmock scoring service for this test

// Mock configManager
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      log_path: './logs/test.log',
      endpoints: {
        alpha: { type: 'ollama', base_url: 'http://localhost:11434', model: 'alpha-model' },
        beta: { type: 'openrouter', base_url: 'https://openrouter.ai/api/v1', model: 'beta-model', api_key: 'test-key' },
      },
      system_prompts: {
        alpha: { base_prompt: 'Alpha base prompt.' },
        beta: { base_prompt: 'Beta base prompt.' },
      },
    },
  },
}));


describe('Full Review-Revise Loop Integration Test', () => {

  beforeEach(async () => {
    // Clear all mocks and session state before each test
    jest.clearAllMocks();
    mockPrismaClient.session.deleteMany.mockResolvedValue({ count: 0 });
    await clearAllSessions();
  });

  it('should complete a happy path review-revise loop and converge', async () => {
    // --- 1. Setup ---
    const sessionId = 'integration-test-session';

    // Mock Prisma responses for session creation
    mockPrismaClient.session.create.mockResolvedValue({
      id: sessionId,
      state: 'IDLE',
      current_iteration: 0,
      max_iterations: 3,
      quality_threshold: 85,
      last_quality_score: null,
      score_history: [],
      content_hashes: [],
      elapsed_time_ms: BigInt(0),
      start_time: BigInt(Date.now()),
      task_timeout_minutes: 30,
      time_per_iteration_ms: [],
      created_at: new Date(),
      updated_at: new Date(),
      artifacts: [],
    });

    mockPrismaClient.session.update.mockResolvedValue({});

    const initialSession = await createSessionState(sessionId);
    initialSession.quality_threshold = 85;
    initialSession.max_iterations = 3;
    await updateSessionState(initialSession);

    const stateMachine = new StateMachine(initialSession);
    const loopGuard = new LoopGuard(initialSession, {
      stagnationThreshold: 2,
      stagnationWindow: 2,
      oscillationDetection: true,
    });

    const agentAlpha = new AgentAlpha();
    const agentBeta = new AgentBeta();

    // --- 2. Initial Code Generation ---
    stateMachine.transitionTo(StateMachineState.GENERATING);
    const initialCode = 'function initialCode() {}';
    mockAlphaGenerate.mockResolvedValueOnce(initialCode);
    const generatedCode = await agentAlpha.generate({ description: 'test', language: 'javascript' });
    const codeArtifact: Artifact = { id: 'code-1', type: 'code', content: generatedCode, description: 'Initial version', timestamp: Date.now() };
    initialSession.artifacts.push(codeArtifact);
    
    stateMachine.transitionTo(StateMachineState.REVIEWING);
    expect(stateMachine.getCurrentState()).toBe(StateMachineState.REVIEWING);

    // --- 3. First Review (Fails) ---
    const firstReview: ReviewFeedback = { quality_score: 60, defects: [{severity: 'critical', category: 'bug', location: 'line 1', description: 'bad bug'}], suggestions: [], required_changes: [] };
    mockBetaReview.mockResolvedValueOnce(firstReview);
    const reviewResult1 = await agentBeta.reviewArtifact(codeArtifact);
    
    const score1 = calculateQualityScore({ defects: reviewResult1.defects });
    initialSession.last_quality_score = score1;
    initialSession.score_history.push(score1);

    expect(score1).toBeLessThan(initialSession.quality_threshold);
    const loopCheck1 = loopGuard.shouldContinue();
    expect(loopCheck1.shouldContinue).toBe(true);
    
    stateMachine.transitionTo(StateMachineState.REVISING);
    expect(stateMachine.getCurrentState()).toBe(StateMachineState.REVISING);
    expect(initialSession.current_iteration).toBe(1);

    // --- 4. Code Revision ---
    const revisedCode = 'function revisedCode() { /* improved */ }';
    mockAlphaRevise.mockResolvedValueOnce(revisedCode);
    const revisedCodeContent = await agentAlpha.revise(codeArtifact, reviewResult1);
    const revisedArtifact: Artifact = { id: 'code-2', type: 'code', content: revisedCodeContent, description: 'Revision 1', timestamp: Date.now() };
    initialSession.artifacts.push(revisedArtifact);
    
    stateMachine.transitionTo(StateMachineState.REVIEWING);
    expect(stateMachine.getCurrentState()).toBe(StateMachineState.REVIEWING);

    // --- 5. Second Review (Succeeds) ---
    const secondReview: ReviewFeedback = { quality_score: 95, defects: [], suggestions: [], required_changes: [] };
    mockBetaReview.mockResolvedValueOnce(secondReview);
    const reviewResult2 = await agentBeta.reviewArtifact(revisedArtifact);
    
    const score2 = calculateQualityScore({ defects: reviewResult2.defects });
    initialSession.last_quality_score = score2;
    initialSession.score_history.push(score2);
    
    expect(score2).toBeGreaterThanOrEqual(initialSession.quality_threshold);
    
    stateMachine.transitionTo(StateMachineState.CONVERGED);
    expect(stateMachine.getCurrentState()).toBe(StateMachineState.CONVERGED);
  });
});
