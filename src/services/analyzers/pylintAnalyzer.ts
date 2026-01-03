/**
 * Pylint Analyzer
 *
 * Static analysis for Python using Pylint.
 * Detects code quality issues, style violations, and potential bugs.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { StaticAnalyzer } from '../staticAnalysisService';
import { Artifact, StaticAnalysisViolation } from '../../types/mcp';
import { logger } from '../loggerService';
import { tempFileManager } from '../tempFileManager';

const execFileAsync = promisify(execFile);

export class PylintAnalyzer implements StaticAnalyzer {
  language = 'python';
  toolName = 'pylint';

  async analyze(
    artifact: Artifact,
    workspacePath: string
  ): Promise<StaticAnalysisViolation[]> {
    try {
      // Write artifact to file
      const filePath = await tempFileManager.writeArtifact(workspacePath, artifact);

      // Run Pylint with JSON output
      const args = [
        filePath,
        '--output-format=json',
        '--disable=C0114,C0115,C0116', // Disable missing docstring warnings
        '--score=no', // Don't show score
      ];

      // Execute Pylint
      const result = await this.executePylint(workspacePath, args);

      // Parse JSON output
      return this.parsePylintOutput(result.stdout, path.basename(filePath));

    } catch (error: any) {
      logger.error(`Pylint analysis failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute Pylint command
   */
  private async executePylint(
    workspacePath: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync('pylint', args, {
        cwd: workspacePath,
        timeout: 60000, // 1 minute timeout
        maxBuffer: 10 * 1024 * 1024,
      });

      return { stdout, stderr };

    } catch (error: any) {
      // Pylint returns non-zero exit code when violations are found
      // This is expected, so return the output
      if (error.stdout) {
        return {
          stdout: error.stdout,
          stderr: error.stderr || '',
        };
      }

      throw error;
    }
  }

  /**
   * Parse Pylint JSON output
   */
  private parsePylintOutput(
    stdout: string,
    fileName: string
  ): StaticAnalysisViolation[] {
    const violations: StaticAnalysisViolation[] = [];

    try {
      const messages = JSON.parse(stdout);

      // Pylint returns an array of message objects
      for (const message of messages) {
        violations.push({
          rule_id: message.symbol || message['message-id'],
          severity: this.mapSeverity(message.type),
          message: message.message,
          location: `${fileName}:${message.line}:${message.column}`,
          line: message.line,
          column: message.column,
        });
      }
    } catch (error: any) {
      logger.error(`Failed to parse Pylint output: ${error.message}`);
    }

    return violations;
  }

  /**
   * Map Pylint message type to our severity levels
   */
  private mapSeverity(type: string): 'low' | 'medium' | 'high' | 'critical' {
    // Pylint types: convention, refactor, warning, error, fatal
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      'convention': 'low',
      'refactor': 'low',
      'warning': 'medium',
      'error': 'high',
      'fatal': 'critical',
    };

    return severityMap[type.toLowerCase()] || 'medium';
  }

  /**
   * Check if Pylint is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync('pylint', ['--version']);
      return true;
    } catch {
      return false;
    }
  }
}
