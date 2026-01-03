/**
 * Session Manager
 *
 * Manages session persistence using PostgreSQL database via Prisma.
 * Replaces the previous in-memory Map-based storage.
 */

import { SessionState, StateMachineState, Artifact } from './types/mcp';
import { configManager } from './services/configService';
import { dbService } from './services/databaseService';
import { logger } from './services/loggerService';
import { Session, Artifact as PrismaArtifact } from '@prisma/client';

/**
 * Convert database Session to SessionState interface
 */
function mapDbSessionToState(
  dbSession: Session & { artifacts?: PrismaArtifact[] }
): SessionState {
  // SQLite stores arrays as JSON, so we need to parse them
  const scoreHistory = Array.isArray(dbSession.score_history)
    ? dbSession.score_history as number[]
    : [];

  const contentHashes = Array.isArray(dbSession.content_hashes)
    ? dbSession.content_hashes as string[]
    : [];

  const timePerIteration = Array.isArray(dbSession.time_per_iteration_ms)
    ? (dbSession.time_per_iteration_ms as any[]).map(Number)
    : [];

  return {
    session_id: dbSession.id,
    state: dbSession.state as StateMachineState,
    current_iteration: dbSession.current_iteration,
    max_iterations: dbSession.max_iterations,
    quality_threshold: dbSession.quality_threshold,
    last_quality_score: dbSession.last_quality_score ?? undefined,
    artifacts: dbSession.artifacts?.map(mapDbArtifactToArtifact) || [],
    elapsed_time_ms: Number(dbSession.elapsed_time_ms),
    score_history: scoreHistory,
    content_hashes: new Set(contentHashes),
    start_time: Number(dbSession.start_time),
    task_timeout_minutes: dbSession.task_timeout_minutes,
    time_per_iteration_ms: timePerIteration,
  };
}

/**
 * Convert database Artifact to Artifact interface
 */
function mapDbArtifactToArtifact(dbArtifact: PrismaArtifact): Artifact {
  return {
    id: dbArtifact.id,
    type: dbArtifact.type as any,
    description: dbArtifact.description,
    timestamp: Number(dbArtifact.timestamp),
    content: dbArtifact.content ?? undefined,
    metadata: dbArtifact.metadata as Record<string, any> | undefined,
  };
}

/**
 * Creates a new session state with default values and persists to database.
 * @param sessionId The ID for the new session.
 * @returns The newly created session state.
 */
export async function createSessionState(sessionId: string): Promise<SessionState> {
  logger.info(`Creating new session: ${sessionId}`);

  try {
    const prisma = dbService.getClient();

    const dbSession = await prisma.session.create({
      data: {
        id: sessionId,
        state: StateMachineState.IDLE,
        current_iteration: 0,
        max_iterations: configManager.config.default_max_iterations,
        quality_threshold: configManager.config.default_quality_threshold,
        last_quality_score: null,
        score_history: [],
        content_hashes: [],
        elapsed_time_ms: 0,
        start_time: BigInt(Date.now()),
        task_timeout_minutes: configManager.config.task_timeout_minutes,
        time_per_iteration_ms: [],
      },
      include: {
        artifacts: true,
      },
    });

    logger.debug(`Session ${sessionId} created successfully in database`);
    return mapDbSessionToState(dbSession);
  } catch (error: any) {
    logger.error(`Failed to create session ${sessionId}: ${error.message}`);
    throw new Error(`Failed to create session: ${error.message}`);
  }
}

/**
 * Retrieves a session state by its ID from the database.
 * @param sessionId The ID of the session to retrieve.
 * @returns The session state, or undefined if not found.
 */
export async function getSessionState(sessionId: string): Promise<SessionState | undefined> {
  logger.debug(`Retrieving session: ${sessionId}`);

  try {
    const prisma = dbService.getClient();

    const dbSession = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        artifacts: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!dbSession) {
      logger.debug(`Session ${sessionId} not found`);
      return undefined;
    }

    return mapDbSessionToState(dbSession);
  } catch (error: any) {
    logger.error(`Failed to retrieve session ${sessionId}: ${error.message}`);
    throw new Error(`Failed to retrieve session: ${error.message}`);
  }
}

/**
 * Updates an existing session state in the database.
 * @param sessionState The session state to update.
 */
export async function updateSessionState(sessionState: SessionState): Promise<void> {
  logger.debug(`Updating session: ${sessionState.session_id}`);

  try {
    const prisma = dbService.getClient();

    // Calculate elapsed time
    const elapsedTime = Date.now() - sessionState.start_time;

    await prisma.session.update({
      where: { id: sessionState.session_id },
      data: {
        state: sessionState.state,
        current_iteration: sessionState.current_iteration,
        max_iterations: sessionState.max_iterations,
        quality_threshold: sessionState.quality_threshold,
        last_quality_score: sessionState.last_quality_score ?? null,
        score_history: sessionState.score_history,
        content_hashes: Array.from(sessionState.content_hashes),
        elapsed_time_ms: BigInt(elapsedTime),
        task_timeout_minutes: sessionState.task_timeout_minutes,
        // Convert to numbers for JSON storage (SQLite limitation)
        time_per_iteration_ms: sessionState.time_per_iteration_ms || [],
      },
    });

    // Update artifacts separately if they've changed
    // Note: Artifacts should be added via addArtifact function
    logger.debug(`Session ${sessionState.session_id} updated successfully`);
  } catch (error: any) {
    logger.error(`Failed to update session ${sessionState.session_id}: ${error.message}`);
    throw new Error(`Failed to update session: ${error.message}`);
  }
}

/**
 * Deletes a session state by its ID from the database.
 * @param sessionId The ID of the session to delete.
 * @returns True if the session was deleted, false if not found.
 */
export async function deleteSessionState(sessionId: string): Promise<boolean> {
  logger.info(`Deleting session: ${sessionId}`);

  try {
    const prisma = dbService.getClient();

    // Check if session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      logger.debug(`Session ${sessionId} not found`);
      return false;
    }

    // Delete session (cascading delete will remove artifacts and reviews)
    await prisma.session.delete({
      where: { id: sessionId },
    });

    logger.info(`Session ${sessionId} deleted successfully`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to delete session ${sessionId}: ${error.message}`);
    throw new Error(`Failed to delete session: ${error.message}`);
  }
}

/**
 * Add an artifact to a session
 * @param sessionId The session ID
 * @param artifact The artifact to add
 */
export async function addArtifact(sessionId: string, artifact: Artifact): Promise<void> {
  logger.debug(`Adding artifact ${artifact.id} to session ${sessionId}`);

  try {
    const prisma = dbService.getClient();

    await prisma.artifact.create({
      data: {
        id: artifact.id,
        session_id: sessionId,
        type: artifact.type,
        description: artifact.description,
        content: artifact.content ?? null,
        metadata: artifact.metadata as any,
        timestamp: BigInt(artifact.timestamp),
      },
    });

    logger.debug(`Artifact ${artifact.id} added successfully`);
  } catch (error: any) {
    logger.error(`Failed to add artifact ${artifact.id}: ${error.message}`);
    throw new Error(`Failed to add artifact: ${error.message}`);
  }
}

/**
 * List all sessions with pagination
 * @param limit Maximum number of sessions to return
 * @param offset Number of sessions to skip
 * @returns Array of session states
 */
export async function listSessions(
  limit: number = 50,
  offset: number = 0
): Promise<SessionState[]> {
  logger.debug(`Listing sessions (limit: ${limit}, offset: ${offset})`);

  try {
    const prisma = dbService.getClient();

    const dbSessions = await prisma.session.findMany({
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: {
        artifacts: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    return dbSessions.map(mapDbSessionToState);
  } catch (error: any) {
    logger.error(`Failed to list sessions: ${error.message}`);
    throw new Error(`Failed to list sessions: ${error.message}`);
  }
}

/**
 * For testing or development purposes, clears all sessions.
 * WARNING: This deletes all data!
 */
export async function clearAllSessions(): Promise<void> {
  logger.warn('Clearing all sessions from database');

  try {
    const prisma = dbService.getClient();

    // Delete all sessions (cascading delete will remove artifacts and reviews)
    const result = await prisma.session.deleteMany({});

    logger.warn(`Cleared ${result.count} sessions from database`);
  } catch (error: any) {
    logger.error(`Failed to clear all sessions: ${error.message}`);
    throw new Error(`Failed to clear sessions: ${error.message}`);
  }
}

/**
 * Cleanup old sessions (older than specified days)
 * @param daysOld Number of days to keep (default: 30)
 * @returns Number of sessions deleted
 */
export async function cleanupOldSessions(daysOld: number = 30): Promise<number> {
  logger.info(`Cleaning up sessions older than ${daysOld} days`);

  try {
    const prisma = dbService.getClient();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await prisma.session.deleteMany({
      where: {
        created_at: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`Cleaned up ${result.count} old sessions`);
    return result.count;
  } catch (error: any) {
    logger.error(`Failed to cleanup old sessions: ${error.message}`);
    throw new Error(`Failed to cleanup sessions: ${error.message}`);
  }
}
