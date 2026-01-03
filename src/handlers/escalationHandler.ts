import { getSessionState } from '../sessionManager';
import { EscalationReason, EscalationMessage, EscalationAction, StateMachineState, Artifact, ReviewFeedback } from '../types/mcp';
import { logger } from '../services/loggerService';

/**
 * Handles the ESCALATED state by packaging session information for the Orchestration Layer.
 * @param session_id The ID of the session to escalate.
 * @param reason The reason for the escalation.
 * @returns A promise that resolves to an EscalationMessage object.
 */
export async function handle_escalation(session_id: string, reason: EscalationReason): Promise<EscalationMessage> {
  const session = await getSessionState(session_id);

  if (!session) {
    logger.error(`handle_escalation: Session with ID ${session_id} not found.`);
    throw new Error(`Session with ID ${session_id} not found.`);
  }

  if (session.state !== StateMachineState.ESCALATED) {
    logger.warn(`handle_escalation: Session ${session_id} is not in the ESCALATED state.`);
    // Proceeding anyway, as this function is the designated handler for escalation.
  }

  logger.info(`handle_escalation: Handling escalation for session ${session_id} due to: ${reason}`);

  // Find the best code artifact based on the highest score
  let bestArtifact: Artifact | undefined;
  let bestScore = -1;
  const iteration_history = session.score_history.map((score, index) => {
    const artifact = session.artifacts.find(a => a.type === 'code' && a.metadata?.iteration === index + 1);
    if (score > bestScore) {
      bestScore = score;
      bestArtifact = artifact;
    }
    return {
      iteration: index + 1,
      score,
      artifact_id: artifact?.id || 'N/A',
    };
  });

  // Find the final critique (the last review artifact)
  const finalCritiqueArtifact = session.artifacts.slice().reverse().find(a => a.type === 'review');
  const final_critique: ReviewFeedback = finalCritiqueArtifact?.content ? JSON.parse(finalCritiqueArtifact.content) : {
    quality_score: session.last_quality_score || 0,
    defects: [],
    suggestions: [],
    required_changes: [],
  };

  // Define available actions for the Orchestration Layer
  const available_actions: EscalationAction[] = [
    { type: 'abort' },
    { type: 'accept_best_effort' },
    { type: 'retry_with_constraints', additional_constraints: [] },
    { type: 'switch_llm', target_agent: 'alpha' },
  ];

  if (!bestArtifact) {
    // This should ideally not happen if there's at least one iteration.
    logger.error(`handle_escalation: Could not find any code artifact to designate as 'best' in session ${session_id}.`);
    throw new Error('Cannot escalate without a code artifact.');
  }

  const escalationMessage: EscalationMessage = {
    session_id,
    reason,
    best_artifact: bestArtifact,
    iteration_history,
    final_critique,
    available_actions,
  };

  return escalationMessage;
}
