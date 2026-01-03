import { getSessionState } from '../sessionManager';
import { FinalHandoffArchiveParams, FinalHandoffArchiveResponse, StateMachineState, Artifact, AuditEntry } from '../types/mcp';
import { logger } from '../services/loggerService';
import { recommendationService } from '../services/recommendationService';

/**
 * Packages all artifacts from a session into a final archive for the Orchestration Layer.
 */
export async function final_handoff_archive(params: FinalHandoffArchiveParams): Promise<FinalHandoffArchiveResponse> {
  const { session_id, include_audit = true } = params;

  const session = await getSessionState(session_id);

  if (!session) {
    logger.warn(`final_handoff_archive: Session with ID ${session_id} not found.`);
    throw new Error(`Session with ID ${session_id} not found.`);
  }

  // Ensure the session is in a final state before handoff
  if (session.state !== StateMachineState.CONVERGED && session.state !== StateMachineState.ESCALATED) {
    logger.warn(`final_handoff_archive: Session ${session_id} is not in a final state (CONVERGED or ESCALATED). Current state: ${session.state}`);
    // Depending on requirements, this could be a soft warning or a hard error
  }

  // Find the final code artifact and test suite from the session's artifacts
  // This is a simplified logic. A real implementation might have a more robust way to track the "final" artifact.
  const final_artifact = session.artifacts.slice().reverse().find(a => a.type === 'code');
  const test_suite = session.artifacts.slice().reverse().find(a => a.type === 'test_suite');
  
  let audit_trail: AuditEntry[] | undefined = undefined;
  if (include_audit) {
    const auditTrailArtifacts = session.artifacts.filter(a => a.type === 'audit_trail');
    if (auditTrailArtifacts.length > 0) {
      audit_trail = auditTrailArtifacts.map(a => (a.metadata || {}) as AuditEntry);
    }
  }


  const archive_id = `archive-${session_id}`;
  logger.info(`final_handoff_archive: Creating archive ${archive_id} for session ${session_id}`);

  // Generate intelligent recommendations based on session data
  logger.info(`final_handoff_archive: Generating recommendations for session ${session_id}`);
  const recommendations = await recommendationService.generateRecommendations(session);

  // Convert recommendations to string format for the response
  const recommendationStrings = recommendations.map(rec => {
    const severityPrefix = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '⚠️' : 'ℹ️';
    let message = `${severityPrefix} ${rec.message}`;
    if (rec.details) {
      message += `\n  ${rec.details}`;
    }
    return message;
  });

  logger.info(`final_handoff_archive: Generated ${recommendationStrings.length} recommendations`);

  const response: FinalHandoffArchiveResponse = {
    archive_id,
    session_id,
    final_artifact,
    test_suite,
    final_quality_score: session.last_quality_score || 0,
    total_iterations: session.current_iteration,
    audit_trail,
    recommendations: recommendationStrings,
  };

  return response;
}