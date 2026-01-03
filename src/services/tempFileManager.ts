/**
 * Temporary File Manager
 *
 * Manages temporary workspace directories for test execution.
 * Creates isolated directories, writes artifacts to files, and handles cleanup.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Artifact } from '../types/mcp';
import { logger } from './loggerService';

export class TempFileManager {
  private workspaces: Set<string> = new Set();

  /**
   * Creates an isolated temporary workspace directory
   * @param sessionId Session ID for namespacing
   * @returns Path to temporary workspace
   */
  async createTempWorkspace(sessionId: string): Promise<string> {
    const timestamp = Date.now();
    const workspaceName = `alcs-test-${sessionId}-${timestamp}`;
    const workspacePath = path.join(os.tmpdir(), workspaceName);

    try {
      // Create main workspace directory
      await fs.mkdir(workspacePath, { recursive: true });

      // Create subdirectories
      await fs.mkdir(path.join(workspacePath, 'code'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'tests'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'reports'), { recursive: true });
      await fs.mkdir(path.join(workspacePath, 'logs'), { recursive: true });

      this.workspaces.add(workspacePath);
      logger.info(`Created temporary workspace: ${workspacePath}`);

      return workspacePath;
    } catch (error: any) {
      logger.error(`Failed to create temp workspace: ${error.message}`);
      throw new Error(`Failed to create temporary workspace: ${error.message}`);
    }
  }

  /**
   * Writes artifact content to appropriate file in workspace
   * @param workspace Path to workspace
   * @param artifact Artifact to write
   * @returns Path to written file
   */
  async writeArtifact(workspace: string, artifact: Artifact): Promise<string> {
    if (!artifact.content) {
      throw new Error(`Artifact ${artifact.id} has no content`);
    }

    const filePath = this.getFilePath(workspace, artifact);

    try {
      await fs.writeFile(filePath, artifact.content, 'utf-8');
      logger.debug(`Wrote artifact ${artifact.id} to ${filePath}`);
      return filePath;
    } catch (error: any) {
      logger.error(`Failed to write artifact ${artifact.id}: ${error.message}`);
      throw new Error(`Failed to write artifact: ${error.message}`);
    }
  }

  /**
   * Writes multiple artifacts to workspace
   * @param workspace Path to workspace
   * @param artifacts Array of artifacts to write
   * @returns Array of file paths
   */
  async writeArtifacts(workspace: string, artifacts: Artifact[]): Promise<string[]> {
    const paths: string[] = [];
    for (const artifact of artifacts) {
      const filePath = await this.writeArtifact(workspace, artifact);
      paths.push(filePath);
    }
    return paths;
  }

  /**
   * Gets the appropriate file path for an artifact
   * @param workspace Path to workspace
   * @param artifact Artifact to get path for
   * @returns File path
   */
  getFilePath(workspace: string, artifact: Artifact): string {
    let subdir: string;
    let filename: string;

    // Determine subdirectory based on artifact type
    switch (artifact.type) {
      case 'code':
        subdir = 'code';
        filename = this.getFileNameFromMetadata(artifact, 'main');
        break;
      case 'test_suite':
        subdir = 'tests';
        filename = this.getFileNameFromMetadata(artifact, 'test');
        break;
      case 'review':
        subdir = 'reports';
        filename = `review-${artifact.id}.json`;
        break;
      case 'log':
        subdir = 'logs';
        filename = `${artifact.id}.log`;
        break;
      default:
        subdir = 'code';
        filename = `artifact-${artifact.id}.txt`;
    }

    return path.join(workspace, subdir, filename);
  }

  /**
   * Determines filename from artifact metadata or creates default
   * @param artifact Artifact to get filename for
   * @param defaultPrefix Default prefix if no metadata
   * @returns Filename
   */
  private getFileNameFromMetadata(artifact: Artifact, defaultPrefix: string): string {
    // Check if metadata contains a filename
    if (artifact.metadata?.filename) {
      return artifact.metadata.filename;
    }

    // Check if metadata contains language and generate appropriate extension
    if (artifact.metadata?.language) {
      const extension = this.getExtensionForLanguage(artifact.metadata.language);
      return `${defaultPrefix}${extension}`;
    }

    // Check framework for test files
    if (artifact.metadata?.framework) {
      const extension = this.getExtensionForFramework(artifact.metadata.framework);
      return `${defaultPrefix}${extension}`;
    }

    // Default fallback
    return `${defaultPrefix}.txt`;
  }

  /**
   * Gets file extension for programming language
   * @param language Programming language
   * @returns File extension with dot
   */
  private getExtensionForLanguage(language: string): string {
    const extensions: Record<string, string> = {
      'python': '.py',
      'javascript': '.js',
      'typescript': '.ts',
      'go': '.go',
      'rust': '.rs',
      'java': '.java',
      'cpp': '.cpp',
      'c': '.c',
    };
    return extensions[language.toLowerCase()] || '.txt';
  }

  /**
   * Gets file extension for test framework
   * @param framework Test framework name
   * @returns File extension with dot
   */
  private getExtensionForFramework(framework: string): string {
    const extensions: Record<string, string> = {
      'pytest': '.py',
      'jest': '.test.js',
      'go_testing': '_test.go',
      'rust_test': '.rs',
      'junit5': '.java',
      'gtest': '.cpp',
    };
    return extensions[framework.toLowerCase()] || '.txt';
  }

  /**
   * Reads content from a file in workspace
   * @param filePath Path to file
   * @returns File content
   */
  async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error: any) {
      logger.error(`Failed to read file ${filePath}: ${error.message}`);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Checks if a file exists in workspace
   * @param filePath Path to file
   * @returns True if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleans up temporary workspace directory
   * @param workspace Path to workspace
   */
  async cleanup(workspace: string): Promise<void> {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
      this.workspaces.delete(workspace);
      logger.info(`Cleaned up temporary workspace: ${workspace}`);
    } catch (error: any) {
      logger.error(`Failed to cleanup workspace ${workspace}: ${error.message}`);
      // Don't throw - cleanup is best effort
    }
  }

  /**
   * Cleans up all tracked workspaces
   * Should be called on graceful shutdown
   */
  async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up ${this.workspaces.size} temporary workspaces`);
    const cleanupPromises = Array.from(this.workspaces).map(ws => this.cleanup(ws));
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Cleans up old temporary directories (older than 1 hour)
   * Should be called periodically as a cleanup job
   */
  async cleanupOldWorkspaces(): Promise<number> {
    const tmpDir = os.tmpdir();
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    let cleanedCount = 0;

    try {
      const entries = await fs.readdir(tmpDir, { withFileTypes: true });

      for (const entry of entries) {
        // Only clean up our workspace directories
        if (entry.isDirectory() && entry.name.startsWith('alcs-test-')) {
          const workspacePath = path.join(tmpDir, entry.name);

          try {
            const stats = await fs.stat(workspacePath);

            // Delete if older than 1 hour
            if (stats.mtimeMs < oneHourAgo) {
              await fs.rm(workspacePath, { recursive: true, force: true });
              cleanedCount++;
              logger.debug(`Cleaned up old workspace: ${workspacePath}`);
            }
          } catch (error: any) {
            logger.warn(`Failed to clean up ${workspacePath}: ${error.message}`);
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} old temporary workspaces`);
      }

      return cleanedCount;
    } catch (error: any) {
      logger.error(`Failed to clean up old workspaces: ${error.message}`);
      return cleanedCount;
    }
  }
}

// Export singleton instance
export const tempFileManager = new TempFileManager();
