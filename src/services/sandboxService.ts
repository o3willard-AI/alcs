/**
 * Sandbox Service
 *
 * Provides isolated execution environments using Docker containers.
 * Implements security hardening, resource limits, and timeout enforcement.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { logger } from './loggerService';
import { TestExecutionOptions } from '../types/mcp';

const execFileAsync = promisify(execFile);

export interface SandboxConfig {
  image: string;              // Docker image to use
  timeout_seconds: number;    // Max execution time
  memory_limit_mb: number;    // Max memory
  cpu_limit: number;          // CPU shares (1.0 = 1 core)
  network_mode: 'none' | 'bridge'; // Network access
  readonly_rootfs: boolean;   // Read-only root filesystem
  tmpfs_size_mb: number;      // Temporary filesystem size
}

export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killedBySignal: boolean;
}

export class SandboxService {
  private containerPrefix = 'alcs-test-';

  /**
   * Check if Docker is available
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execFileAsync('docker', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute command in Docker sandbox
   * @param config Sandbox configuration
   * @param command Command to execute
   * @param workspacePath Path to workspace (will be mounted)
   * @param workDir Working directory inside container
   * @returns Execution result
   */
  async executeInSandbox(
    config: SandboxConfig,
    command: string[],
    workspacePath: string,
    workDir: string = '/workspace'
  ): Promise<SandboxExecutionResult> {
    const containerId = `${this.containerPrefix}${Date.now()}`;

    logger.info(`Executing in sandbox: ${command.join(' ')}`);

    try {
      // Build docker run command
      const dockerArgs = this.buildDockerArgs(config, containerId, workspacePath, workDir);
      dockerArgs.push(...command);

      // Execute docker command
      const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
        timeout: config.timeout_seconds * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      // Clean up container
      await this.removeContainer(containerId);

      return {
        exitCode: 0,
        stdout,
        stderr,
        timedOut: false,
        killedBySignal: false,
      };

    } catch (error: any) {
      // Clean up container even on error
      await this.removeContainer(containerId);

      // Check if timeout
      const timedOut = error.code === 'ETIMEDOUT' || error.killed;

      return {
        exitCode: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        timedOut,
        killedBySignal: error.killed || false,
      };
    }
  }

  /**
   * Build Docker run arguments
   */
  private buildDockerArgs(
    config: SandboxConfig,
    containerId: string,
    workspacePath: string,
    workDir: string
  ): string[] {
    const args = [
      'run',
      '--rm', // Auto-remove container after execution
      '--name', containerId,

      // Resource limits
      `--memory=${config.memory_limit_mb}m`,
      `--cpus=${config.cpu_limit}`,
      '--pids-limit=100', // Prevent fork bombs

      // Network isolation
      `--network=${config.network_mode}`,

      // Security options
      '--security-opt=no-new-privileges', // Prevent privilege escalation
      '--cap-drop=ALL', // Drop all Linux capabilities
      '--cap-add=CHOWN', // Only allow necessary capabilities
      '--cap-add=SETGID',
      '--cap-add=SETUID',

      // User namespace (run as non-root)
      '--user=1000:1000',

      // Mount workspace
      `--volume=${workspacePath}:${workDir}:rw`,
      '--workdir', workDir,

      // Tmpfs for temporary files (ephemeral, memory-backed)
      `--tmpfs=/tmp:rw,size=${config.tmpfs_size_mb}m,mode=1777`,
    ];

    // Read-only root filesystem (optional)
    if (config.readonly_rootfs) {
      args.push('--read-only');
    }

    // Add image
    args.push(config.image);

    return args;
  }

  /**
   * Remove container (cleanup)
   */
  private async removeContainer(containerId: string): Promise<void> {
    try {
      await execFileAsync('docker', ['rm', '-f', containerId]);
      logger.debug(`Removed container: ${containerId}`);
    } catch (error: any) {
      // Ignore errors if container doesn't exist
      logger.debug(`Failed to remove container ${containerId}: ${error.message}`);
    }
  }

  /**
   * Get default sandbox config for a test framework
   */
  getDefaultConfig(options: TestExecutionOptions): SandboxConfig {
    return {
      image: 'python:3.11-slim', // Default image
      timeout_seconds: options.timeout_seconds || 300,
      memory_limit_mb: options.memory_limit_mb || 512,
      cpu_limit: options.cpu_limit || 1.0,
      network_mode: options.enable_network ? 'bridge' : 'none',
      readonly_rootfs: false, // Allow writes to workspace
      tmpfs_size_mb: 100,
    };
  }

  /**
   * Get Docker image for test framework
   */
  getImageForFramework(framework: string): string {
    const images: Record<string, string> = {
      'pytest': 'python:3.11-slim',
      'jest': 'node:20-alpine',
      'go_testing': 'golang:1.21-alpine',
      'junit5': 'eclipse-temurin:17-jdk-alpine',
      'rust_test': 'rust:1.75-alpine',
      'gtest': 'gcc:13-alpine',
    };

    return images[framework] || 'ubuntu:22.04';
  }

  /**
   * Check if Docker image exists locally
   */
  async imageExists(image: string): Promise<boolean> {
    try {
      await execFileAsync('docker', ['image', 'inspect', image]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pull Docker image if not available
   */
  async pullImage(image: string): Promise<void> {
    logger.info(`Pulling Docker image: ${image}`);

    try {
      await execFileAsync('docker', ['pull', image], {
        timeout: 300000, // 5 minutes for image pull
      });
      logger.info(`Successfully pulled image: ${image}`);
    } catch (error: any) {
      logger.error(`Failed to pull image ${image}: ${error.message}`);
      throw new Error(`Failed to pull Docker image: ${error.message}`);
    }
  }

  /**
   * Ensure Docker image is available (pull if needed)
   */
  async ensureImage(image: string): Promise<void> {
    const exists = await this.imageExists(image);
    if (!exists) {
      await this.pullImage(image);
    }
  }

  /**
   * List running ALCS test containers
   */
  async listRunningContainers(): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('docker', [
        'ps',
        '--filter', `name=${this.containerPrefix}`,
        '--format', '{{.Names}}',
      ]);

      return stdout.split('\n').filter(name => name.trim());
    } catch (error: any) {
      logger.error(`Failed to list containers: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up stale containers
   */
  async cleanupStaleContainers(): Promise<number> {
    const containers = await this.listRunningContainers();
    let cleanedCount = 0;

    for (const container of containers) {
      try {
        await this.removeContainer(container);
        cleanedCount++;
      } catch (error: any) {
        logger.warn(`Failed to cleanup container ${container}: ${error.message}`);
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} stale containers`);
    }

    return cleanedCount;
  }
}

// Export singleton instance
export const sandboxService = new SandboxService();
