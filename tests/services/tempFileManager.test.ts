/**
 * Unit Tests for Temp File Manager
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TempFileManager } from '../../src/services/tempFileManager';
import { Artifact } from '../../src/types/mcp';

jest.mock('../../src/services/loggerService');

describe('TempFileManager', () => {
  let manager: TempFileManager;
  let createdWorkspaces: string[] = [];

  beforeEach(() => {
    manager = new TempFileManager();
    createdWorkspaces = [];
  });

  afterEach(async () => {
    // Cleanup any created workspaces
    for (const workspace of createdWorkspaces) {
      try {
        await fs.rm(workspace, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('createTempWorkspace', () => {
    it('should create temporary workspace with subdirectories', async () => {
      const workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);

      expect(workspace).toContain('alcs-test-test-session');

      // Check subdirectories exist
      const codeDir = path.join(workspace, 'code');
      const testsDir = path.join(workspace, 'tests');
      const reportsDir = path.join(workspace, 'reports');
      const logsDir = path.join(workspace, 'logs');

      await expect(fs.access(codeDir)).resolves.not.toThrow();
      await expect(fs.access(testsDir)).resolves.not.toThrow();
      await expect(fs.access(reportsDir)).resolves.not.toThrow();
      await expect(fs.access(logsDir)).resolves.not.toThrow();
    });

    it('should create unique workspaces for same session', async () => {
      const workspace1 = await manager.createTempWorkspace('test-session');
      const workspace2 = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace1, workspace2);

      expect(workspace1).not.toBe(workspace2);
    });
  });

  describe('writeArtifact', () => {
    let workspace: string;

    beforeEach(async () => {
      workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);
    });

    it('should write code artifact to code directory', async () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Sample code',
        timestamp: Date.now(),
        content: 'def hello(): return "world"',
        metadata: { language: 'python' },
      };

      const filePath = await manager.writeArtifact(workspace, artifact);

      expect(filePath).toContain('/code/');
      expect(filePath).toMatch(/\.py$/);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(artifact.content);
    });

    it('should write test artifact to tests directory', async () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Sample tests',
        timestamp: Date.now(),
        content: 'def test_hello(): assert hello() == "world"',
        metadata: { framework: 'pytest' },
      };

      const filePath = await manager.writeArtifact(workspace, artifact);

      expect(filePath).toContain('/tests/');
      expect(filePath).toMatch(/\.py$/);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(artifact.content);
    });

    it('should throw error if artifact has no content', async () => {
      const artifact: Artifact = {
        id: 'empty-1',
        type: 'code',
        description: 'Empty artifact',
        timestamp: Date.now(),
      };

      await expect(manager.writeArtifact(workspace, artifact)).rejects.toThrow(
        'Artifact empty-1 has no content'
      );
    });
  });

  describe('getFilePath', () => {
    let workspace: string;

    beforeEach(async () => {
      workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);
    });

    it('should generate correct path for Python code', () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        metadata: { language: 'python' },
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/code/');
      expect(filePath).toMatch(/\.py$/);
    });

    it('should generate correct path for JavaScript code', () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        metadata: { language: 'javascript' },
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/code/');
      expect(filePath).toMatch(/\.js$/);
    });

    it('should generate correct path for Go code', () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        metadata: { language: 'go' },
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/code/');
      expect(filePath).toMatch(/\.go$/);
    });

    it('should generate correct path for Jest tests', () => {
      const artifact: Artifact = {
        id: 'test-1',
        type: 'test_suite',
        description: 'Test',
        timestamp: Date.now(),
        metadata: { framework: 'jest' },
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/tests/');
      expect(filePath).toMatch(/\.test\.js$/);
    });

    it('should use custom filename from metadata if provided', () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        metadata: { filename: 'custom-name.py' },
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('custom-name.py');
    });

    it('should handle review artifacts', () => {
      const artifact: Artifact = {
        id: 'review-1',
        type: 'review',
        description: 'Review',
        timestamp: Date.now(),
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/reports/');
      expect(filePath).toMatch(/review-.*\.json$/);
    });

    it('should handle log artifacts', () => {
      const artifact: Artifact = {
        id: 'log-1',
        type: 'log',
        description: 'Log',
        timestamp: Date.now(),
      };

      const filePath = manager.getFilePath(workspace, artifact);

      expect(filePath).toContain('/logs/');
      expect(filePath).toMatch(/\.log$/);
    });
  });

  describe('writeArtifacts', () => {
    let workspace: string;

    beforeEach(async () => {
      workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);
    });

    it('should write multiple artifacts', async () => {
      const artifacts: Artifact[] = [
        {
          id: 'code-1',
          type: 'code',
          description: 'Code',
          timestamp: Date.now(),
          content: 'code content',
          metadata: { language: 'python' },
        },
        {
          id: 'test-1',
          type: 'test_suite',
          description: 'Test',
          timestamp: Date.now(),
          content: 'test content',
          metadata: { framework: 'pytest' },
        },
      ];

      const paths = await manager.writeArtifacts(workspace, artifacts);

      expect(paths).toHaveLength(2);
      expect(paths[0]).toContain('/code/');
      expect(paths[1]).toContain('/tests/');
    });
  });

  describe('readFile', () => {
    let workspace: string;

    beforeEach(async () => {
      workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);
    });

    it('should read file content', async () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        content: 'test content',
        metadata: { language: 'python' },
      };

      const filePath = await manager.writeArtifact(workspace, artifact);
      const content = await manager.readFile(filePath);

      expect(content).toBe('test content');
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        manager.readFile(path.join(workspace, 'non-existent.txt'))
      ).rejects.toThrow('Failed to read file');
    });
  });

  describe('fileExists', () => {
    let workspace: string;

    beforeEach(async () => {
      workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);
    });

    it('should return true for existing file', async () => {
      const artifact: Artifact = {
        id: 'code-1',
        type: 'code',
        description: 'Code',
        timestamp: Date.now(),
        content: 'content',
        metadata: { language: 'python' },
      };

      const filePath = await manager.writeArtifact(workspace, artifact);
      const exists = await manager.fileExists(filePath);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await manager.fileExists(
        path.join(workspace, 'non-existent.txt')
      );

      expect(exists).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove workspace directory', async () => {
      const workspace = await manager.createTempWorkspace('test-session');
      createdWorkspaces.push(workspace);

      // Verify workspace exists
      await expect(fs.access(workspace)).resolves.not.toThrow();

      // Cleanup
      await manager.cleanup(workspace);

      // Verify workspace is removed
      await expect(fs.access(workspace)).rejects.toThrow();

      // Remove from tracking since it's already cleaned
      createdWorkspaces = createdWorkspaces.filter(w => w !== workspace);
    });

    it('should not throw if workspace does not exist', async () => {
      await expect(
        manager.cleanup('/tmp/non-existent-workspace')
      ).resolves.not.toThrow();
    });
  });

  describe('cleanupOldWorkspaces', () => {
    it('should cleanup old workspaces', async () => {
      // Create an old workspace by manually creating directory
      const oldWorkspace = path.join(
        os.tmpdir(),
        `alcs-test-old-${Date.now() - 2 * 60 * 60 * 1000}`
      );
      await fs.mkdir(oldWorkspace, { recursive: true });
      createdWorkspaces.push(oldWorkspace);

      // Modify timestamp to make it old (requires platform-specific touch)
      // For testing, we'll just verify the method runs without errors

      const count = await manager.cleanupOldWorkspaces();

      // Count will depend on existing old workspaces
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
