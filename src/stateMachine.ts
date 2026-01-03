import { StateMachineState, SessionState } from './types/mcp';
import { logger } from './services/loggerService';

// Define valid transitions
const validTransitions: Map<StateMachineState, StateMachineState[]> = new Map([
  [StateMachineState.IDLE, [StateMachineState.GENERATING]],
  [StateMachineState.GENERATING, [StateMachineState.REVIEWING, StateMachineState.FAILED]],
  [StateMachineState.REVIEWING, [StateMachineState.CONVERGED, StateMachineState.REVISING, StateMachineState.ESCALATED]],
  [StateMachineState.REVISING, [StateMachineState.REVIEWING, StateMachineState.FAILED]],
  [StateMachineState.CONVERGED, [StateMachineState.IDLE]],
  [StateMachineState.ESCALATED, [StateMachineState.REVISING, StateMachineState.IDLE, StateMachineState.FAILED]],
  [StateMachineState.FAILED, [StateMachineState.IDLE]],
]);

export class StateMachine {
  private session: SessionState;

  constructor(session: SessionState) {
    this.session = session;
  }

  /**
   * Attempts to transition the state machine to a new state.
   * @param newState The state to transition to.
   * @throws An error if the transition is invalid.
   */
  public transitionTo(newState: StateMachineState): void {
    const currentState = this.session.state;
    const allowedTransitions = validTransitions.get(currentState);

    if (!allowedTransitions || !allowedTransitions.includes(newState)) {
      const errorMessage = `Invalid state transition from ${currentState} to ${newState}.`;
      logger.error(`StateMachine: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    logger.info(`StateMachine: Transitioning session ${this.session.session_id} from ${currentState} to ${newState}.`);
    this.session.state = newState;

    // Additional logic for specific state entries can be added here
    if (newState === StateMachineState.REVISING) {
      this.session.current_iteration++;
    }
    if (newState === StateMachineState.IDLE) {
      // Reset session for potential reuse or finalization
      this.session.current_iteration = 0;
      this.session.score_history = [];
      this.session.content_hashes = new Set();
    }
  }

  /**
   * Returns the current state of the session.
   * @returns The current StateMachineState.
   */
  public getCurrentState(): StateMachineState {
    return this.session.state;
  }
}
