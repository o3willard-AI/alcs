import { getSessionState } from '../sessionManager';
import { GetProgressSummaryParams, GetProgressSummaryResponse, ConvergenceTrend, StateMachineState } from '../types/mcp';
import { logger } from '../services/loggerService';

const STAGNATION_THRESHOLD = 2; // Min score delta to be considered 'improving'
const STAGNATION_WINDOW = 2; // Consecutive iterations to check for stagnation

function analyzeConvergenceTrend(scoreHistory: number[]): ConvergenceTrend {
  if (scoreHistory.length < STAGNATION_WINDOW + 1) {
    return 'insufficient_data';
  }

  // Calculate deltas from the full score history
  const deltas = scoreHistory.slice(1).map((s, i) => s - scoreHistory[i]);

  // Check for stagnation in the last STAGNATION_WINDOW deltas first
  const recentDeltas = deltas.slice(-(STAGNATION_WINDOW));
  if (recentDeltas.length >= STAGNATION_WINDOW && recentDeltas.every(d => Math.abs(d) < STAGNATION_THRESHOLD)) {
    return 'stagnant';
  }

  // Then check for oscillation (simple up/down pattern) in the last two deltas
  if (deltas.length >= 2 && Math.sign(deltas[deltas.length - 1]) !== Math.sign(deltas[deltas.length - 2]) && Math.sign(deltas[deltas.length - 2]) !== 0) {
    return 'oscillating';
  }
  
  // Check for improvement
  const overallTrend = scoreHistory[scoreHistory.length - 1] - scoreHistory[scoreHistory.length - (STAGNATION_WINDOW + 1)];
  if (overallTrend > 0) {
    return 'improving';
  }

  return 'stagnant'; // Default to stagnant if not clearly improving or oscillating
}

/**
 * Retrieves a summary of the progress for a given coding session.
 */
export async function get_progress_summary(params: GetProgressSummaryParams): Promise<GetProgressSummaryResponse> {
  const { session_id, verbosity = 'standard' } = params;

  const session = await getSessionState(session_id);

  if (!session) {
    logger.warn(`get_progress_summary: Session with ID ${session_id} not found.`);
    // In a real scenario, this might be an error. For now, return a default "not found" state.
    return {
      session_id,
      iterations_completed: 0,
      quality_scores: [],
      time_per_iteration_ms: [],
      current_state: StateMachineState.IDLE, // Assuming a non-existent session is IDLE
      convergence_trend: 'insufficient_data',
    };
  }

  const convergenceTrend = analyzeConvergenceTrend(session.score_history);

  const response: GetProgressSummaryResponse = {
    session_id: session.session_id,
    iterations_completed: session.current_iteration,
    quality_scores: session.score_history,
    time_per_iteration_ms: session.time_per_iteration_ms || [],
    current_state: session.state,
    convergence_trend: convergenceTrend,
  };

  // Verbosity can be used here to conditionally add more details to the response
  // For now, it's not implemented, but the structure is ready.
  logger.info(`get_progress_summary: Generated progress summary for session ${session_id}`);

  return response;
}
