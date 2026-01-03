import { StateMachine } from '../src/stateMachine';
import { SessionState, StateMachineState } from '../src/types/mcp';
import { logger } from '../src/services/loggerService';

// Mock the logger to prevent console output during tests
jest.mock('../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StateMachine', () => {
  let mockSession: SessionState;

  beforeEach(() => {
    jest.clearAllMocks();
    // Initialize a fresh mock session before each test
    mockSession = {
      session_id: 'test-session',
      state: StateMachineState.IDLE,
      current_iteration: 0,
      max_iterations: 5,
      quality_threshold: 85,
      artifacts: [],
      score_history: [],
      start_time: Date.now(),
      elapsed_time_ms: 0,
      content_hashes: new Set(),
    };
  });

  // Test valid transitions
  const validTransitionTests = [
    { from: StateMachineState.IDLE, to: StateMachineState.GENERATING },
    { from: StateMachineState.GENERATING, to: StateMachineState.REVIEWING },
    { from: StateMachineState.GENERATING, to: StateMachineState.FAILED },
    { from: StateMachineState.REVIEWING, to: StateMachineState.CONVERGED },
    { from: StateMachineState.REVIEWING, to: StateMachineState.REVISING },
    { from: StateMachineState.REVIEWING, to: StateMachineState.ESCALATED },
    { from: StateMachineState.REVISING, to: StateMachineState.REVIEWING },
    { from: StateMachineState.REVISING, to: StateMachineState.FAILED },
    { from: StateMachineState.CONVERGED, to: StateMachineState.IDLE },
    { from: StateMachineState.ESCALATED, to: StateMachineState.REVISING },
    { from: StateMachineState.ESCALATED, to: StateMachineState.IDLE },
    { from: StateMachineState.ESCALATED, to: StateMachineState.FAILED },
    { from: StateMachineState.FAILED, to: StateMachineState.IDLE },
  ];

  validTransitionTests.forEach(({ from, to }) => {
    it(`should allow transition from ${from} to ${to}`, () => {
      mockSession.state = from;
      const stateMachine = new StateMachine(mockSession);
      stateMachine.transitionTo(to);
      expect(stateMachine.getCurrentState()).toBe(to);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Transitioning session test-session from ${from} to ${to}`));
    });
  });

  // Test invalid transitions
  const invalidTransitionTests = [
    { from: StateMachineState.IDLE, to: StateMachineState.REVIEWING },
    { from: StateMachineState.GENERATING, to: StateMachineState.IDLE },
    { from: StateMachineState.CONVERGED, to: StateMachineState.REVISING },
    { from: StateMachineState.FAILED, to: StateMachineState.GENERATING },
  ];

  invalidTransitionTests.forEach(({ from, to }) => {
    it(`should throw an error for invalid transition from ${from} to ${to}`, () => {
      mockSession.state = from;
      const stateMachine = new StateMachine(mockSession);
      expect(() => {
        stateMachine.transitionTo(to);
      }).toThrow(`Invalid state transition from ${from} to ${to}.`);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Invalid state transition from ${from} to ${to}`));
    });
  });

  it('should increment iteration count when transitioning to REVISING', () => {
    mockSession.state = StateMachineState.REVIEWING;
    mockSession.current_iteration = 2;
    const stateMachine = new StateMachine(mockSession);

    stateMachine.transitionTo(StateMachineState.REVISING);

    expect(stateMachine.getCurrentState()).toBe(StateMachineState.REVISING);
    expect(mockSession.current_iteration).toBe(3);
  });

  it('should reset session properties when transitioning to IDLE', () => {
    mockSession.state = StateMachineState.CONVERGED;
    mockSession.current_iteration = 3;
    mockSession.score_history = [70, 80, 90];
    mockSession.content_hashes = new Set(['hash1', 'hash2']);
    const stateMachine = new StateMachine(mockSession);

    stateMachine.transitionTo(StateMachineState.IDLE);

    expect(stateMachine.getCurrentState()).toBe(StateMachineState.IDLE);
    expect(mockSession.current_iteration).toBe(0);
    expect(mockSession.score_history).toEqual([]);
    expect(mockSession.content_hashes.size).toBe(0);
  });
});
