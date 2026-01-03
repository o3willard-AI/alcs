import { getSessionState, updateSessionState, addArtifact } from '../sessionManager';
import { ReviseCodeParams, Artifact } from '../types/mcp';
import { logger } from '../services/loggerService';
import { AgentAlpha } from '../agents/agentAlpha';

/**
 * Instructs Agent Alpha to revise a code artifact based on feedback.
 * @returns A promise that resolves to the new, revised code artifact.
 */
export async function revise_code(params: ReviseCodeParams): Promise<Artifact> {
  const { session_id, artifact_id, feedback } = params;

  // Use provided session_id or fall back to default
  const sessionId = session_id || 'default-active-session';
  const session = await getSessionState(sessionId);

  if (!session) {
    logger.error(`revise_code: Session with ID ${sessionId} not found.`);
    throw new Error(`Session with ID ${sessionId} not found.`);
  }

  const artifactToRevise = session.artifacts.find(a => a.id === artifact_id && a.type === 'code');

  if (!artifactToRevise) {
    logger.error(`revise_code: Code artifact with ID ${artifact_id} not found in session ${session.session_id}.`);
    throw new Error(`Code artifact with ID ${artifact_id} not found.`);
  }

  logger.info(`revise_code: Starting revision for artifact ${artifact_id}.`);

  const agentAlpha = new AgentAlpha();
  const revisedCode = await agentAlpha.revise(artifactToRevise, feedback);

  // Create a new artifact for the revised code
  const newArtifact: Artifact = {
    id: `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'code',
    description: `Revision of ${artifact_id}`,
    timestamp: Date.now(),
    content: revisedCode,
    metadata: {
      original_artifact_id: artifact_id,
      revision_feedback: feedback,
    },
  };

  // Add artifact to database
  await addArtifact(sessionId, newArtifact);

  // Update local session object for consistency
  session.artifacts.push(newArtifact);
  await updateSessionState(session);

  logger.info(`revise_code: Revision complete. New artifact ID: ${newArtifact.id}`);

  return newArtifact;
}
