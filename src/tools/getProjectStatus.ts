import { getSessionState, createSessionState } from '../sessionManager';
import { SessionState } from '../types/mcp';
import { logger } from '../services/loggerService';

export interface GetProjectStatusParams {
  session_id?: string;
}

export interface GetProjectStatusResponse extends SessionState {}

/**
 * Retrieves the current status of a coding session.
 * If no session_id is provided, a new default session is assumed or created.
 */
export async function get_project_status(params: GetProjectStatusParams = {}): Promise<GetProjectStatusResponse> {
  const { session_id } = params;

  let currentSession: SessionState | undefined;

  if (session_id) {
    currentSession = await getSessionState(session_id);
    if (!currentSession) {
      logger.warn(`get_project_status: Session with ID ${session_id} not found. Returning a default IDLE session.`);
      // For now, if a specific session is not found, we create a temporary "default" one
      // In a real scenario, this might be an error or prompt the user.
      currentSession = await createSessionState(`temp-${session_id}`);
    }
  } else {
    // For now, if no session_id is provided, we use a fixed default.
    // In later phases, this would typically involve a "current active session" concept.
    const defaultSessionId = 'default-active-session';
    currentSession = await getSessionState(defaultSessionId);
    if (!currentSession) {
      logger.info(`get_project_status: No session ID provided, creating a default active session.`);
      currentSession = await createSessionState(defaultSessionId);
    }
  }

  logger.info(`get_project_status: Retrieved status for session ${currentSession!.session_id}`);
  return currentSession!;
}
