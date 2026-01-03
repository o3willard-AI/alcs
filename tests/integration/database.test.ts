/**
 * Database Integration Tests
 *
 * Tests CRUD operations on the database with mocked Prisma client.
 * For real database testing, replace mocks with actual database connection.
 */

import {
  createSessionState,
  getSessionState,
  updateSessionState,
  deleteSessionState,
  addArtifact,
  listSessions,
  cleanupOldSessions,
  clearAllSessions,
} from '../../src/sessionManager';
import { StateMachineState } from '../../src/types/mcp';

// Mock database service
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

jest.mock('../../src/services/loggerService');

describe('Database Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Session CRUD Operations', () => {
    it('should create a new session', async () => {
      const sessionId = 'test-session-1';
      const mockSession = {
        id: sessionId,
        state: StateMachineState.IDLE,
        current_iteration: 0,
        max_iterations: 5,
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
      };

      mockPrismaClient.session.create.mockResolvedValue(mockSession);

      const session = await createSessionState(sessionId);

      expect(mockPrismaClient.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: sessionId,
          state: StateMachineState.IDLE,
          current_iteration: 0,
        }),
        include: { artifacts: true },
      });

      expect(session.session_id).toBe(sessionId);
      expect(session.state).toBe(StateMachineState.IDLE);
      expect(session.artifacts).toEqual([]);
    });

    it('should retrieve an existing session', async () => {
      const sessionId = 'test-session-2';
      const mockSession = {
        id: sessionId,
        state: StateMachineState.GENERATING,
        current_iteration: 2,
        max_iterations: 5,
        quality_threshold: 85,
        last_quality_score: 78,
        score_history: [75, 78],
        content_hashes: ['hash1', 'hash2'],
        elapsed_time_ms: BigInt(5000),
        start_time: BigInt(Date.now() - 5000),
        task_timeout_minutes: 30,
        time_per_iteration_ms: [BigInt(2500), BigInt(2500)],
        created_at: new Date(),
        updated_at: new Date(),
        artifacts: [
          {
            id: 'artifact-1',
            session_id: sessionId,
            type: 'code',
            description: 'Test code',
            content: 'console.log("test");',
            metadata: {},
            timestamp: BigInt(Date.now()),
            created_at: new Date(),
          },
        ],
      };

      mockPrismaClient.session.findUnique.mockResolvedValue(mockSession);

      const session = await getSessionState(sessionId);

      expect(mockPrismaClient.session.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
        include: {
          artifacts: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      expect(session).toBeDefined();
      expect(session!.session_id).toBe(sessionId);
      expect(session!.current_iteration).toBe(2);
      expect(session!.artifacts).toHaveLength(1);
    });

    it('should return undefined for non-existent session', async () => {
      mockPrismaClient.session.findUnique.mockResolvedValue(null);

      const session = await getSessionState('non-existent');

      expect(session).toBeUndefined();
    });

    it('should update a session', async () => {
      const sessionId = 'test-session-3';
      const session = {
        session_id: sessionId,
        state: StateMachineState.REVIEWING,
        current_iteration: 3,
        max_iterations: 5,
        quality_threshold: 85,
        last_quality_score: 88,
        artifacts: [],
        elapsed_time_ms: 10000,
        score_history: [75, 78, 88],
        content_hashes: new Set(['hash1', 'hash2', 'hash3']),
        start_time: Date.now() - 10000,
        task_timeout_minutes: 30,
        time_per_iteration_ms: [2500, 3500, 4000],
      };

      mockPrismaClient.session.update.mockResolvedValue({});

      await updateSessionState(session);

      expect(mockPrismaClient.session.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          state: StateMachineState.REVIEWING,
          current_iteration: 3,
          last_quality_score: 88,
          score_history: [75, 78, 88],
          content_hashes: ['hash1', 'hash2', 'hash3'],
        }),
      });
    });

    it('should delete a session', async () => {
      const sessionId = 'test-session-4';

      mockPrismaClient.session.findUnique.mockResolvedValue({ id: sessionId });
      mockPrismaClient.session.delete.mockResolvedValue({});

      const result = await deleteSessionState(sessionId);

      expect(result).toBe(true);
      expect(mockPrismaClient.session.delete).toHaveBeenCalledWith({
        where: { id: sessionId },
      });
    });

    it('should return false when deleting non-existent session', async () => {
      mockPrismaClient.session.findUnique.mockResolvedValue(null);

      const result = await deleteSessionState('non-existent');

      expect(result).toBe(false);
      expect(mockPrismaClient.session.delete).not.toHaveBeenCalled();
    });
  });

  describe('Artifact Operations', () => {
    it('should add an artifact to a session', async () => {
      const sessionId = 'test-session-5';
      const artifact = {
        id: 'artifact-1',
        type: 'code' as const,
        description: 'Test code artifact',
        timestamp: Date.now(),
        content: 'function test() { return true; }',
        metadata: { language: 'javascript' },
      };

      mockPrismaClient.artifact.create.mockResolvedValue({});

      await addArtifact(sessionId, artifact);

      expect(mockPrismaClient.artifact.create).toHaveBeenCalledWith({
        data: {
          id: artifact.id,
          session_id: sessionId,
          type: artifact.type,
          description: artifact.description,
          content: artifact.content,
          metadata: artifact.metadata,
          timestamp: BigInt(artifact.timestamp),
        },
      });
    });
  });

  describe('Session Listing and Pagination', () => {
    it('should list sessions with default pagination', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          state: StateMachineState.IDLE,
          current_iteration: 0,
          max_iterations: 5,
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
        },
      ];

      mockPrismaClient.session.findMany.mockResolvedValue(mockSessions);

      const sessions = await listSessions();

      expect(mockPrismaClient.session.findMany).toHaveBeenCalledWith({
        take: 50,
        skip: 0,
        orderBy: { created_at: 'desc' },
        include: {
          artifacts: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      expect(sessions).toHaveLength(1);
    });

    it('should list sessions with custom pagination', async () => {
      mockPrismaClient.session.findMany.mockResolvedValue([]);

      await listSessions(10, 20);

      expect(mockPrismaClient.session.findMany).toHaveBeenCalledWith({
        take: 10,
        skip: 20,
        orderBy: { created_at: 'desc' },
        include: {
          artifacts: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup old sessions', async () => {
      mockPrismaClient.session.deleteMany.mockResolvedValue({ count: 5 });

      const count = await cleanupOldSessions(30);

      expect(count).toBe(5);
      expect(mockPrismaClient.session.deleteMany).toHaveBeenCalledWith({
        where: {
          created_at: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should clear all sessions', async () => {
      mockPrismaClient.session.deleteMany.mockResolvedValue({ count: 10 });

      await clearAllSessions();

      expect(mockPrismaClient.session.deleteMany).toHaveBeenCalledWith({});
    });
  });
});
